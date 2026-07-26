import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { decryptEmail, encryptEmail, normalizeInvitationEmail, protectEmailForLookup } from "../../common/security/email-protection";
import { createSecureToken, hashToken } from "../../common/security/token-hash";
import { env } from "../../config/env";
import { OrganizationService } from "../organizations/organization.service";
import { SurveyRepository } from "../surveys/survey.repository";
import type { ISurveyRepository } from "../surveys/survey.repository.interface";
import { BrevoInvitationEmailProvider } from "./brevo-invitation-email.provider";
import type { IInvitationEmailProvider } from "./invitation-email-provider.interface";
import { InvitationRepository } from "./invitation.repository";
import type { IInvitationRepository } from "./invitation.repository.interface";
import type { InvitationListItem, SurveyInvitation } from "./invitation.types";

export class InvitationService {
  public constructor(
    private readonly invitationRepository: IInvitationRepository = new InvitationRepository(),
    private readonly surveyRepository: ISurveyRepository = new SurveyRepository(),
    private readonly organizationService = new OrganizationService(),
    private readonly emailProvider: IInvitationEmailProvider = new BrevoInvitationEmailProvider()
  ) {}

  public async createInvitation(input: {
    createdBy: string;
    expiresAt: string | null;
    maxResponses?: number;
    recipientEmail: string;
    surveyId: string;
  }): Promise<InvitationListItem> {
    const survey = await this.requireManageableSurvey(input.surveyId, input.createdBy);

    if (!survey.publishedVersionId) {
      throw new AppError(
        ERROR_CODES.surveyNotPublished,
        "Invitations can only be created for a published survey.",
        400
      );
    }

    const recipientEmail = normalizeInvitationEmail(input.recipientEmail);
    const recipientEmailHash = protectEmailForLookup(recipientEmail);
    const existingInvitation = await this.invitationRepository.findActiveInvitationByEmailHash(
      survey.id,
      recipientEmailHash
    );

    if (existingInvitation) {
      throw new AppError(
        ERROR_CODES.invitationEmailAlreadyExists,
        "An active invitation already exists for this email.",
        409
      );
    }

    const rawToken = createSecureToken();
    // The invitation token is sent to the recipient but never stored directly.
    // A database leak should not reveal working invitation links.
    const invitation = await this.invitationRepository.createInvitation({
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
      maxResponses: input.maxResponses ?? 1,
      metadata: {},
      recipientEmailCiphertext: encryptEmail(recipientEmail),
      recipientEmailHash,
      surveyId: survey.id,
      tokenHash: hashToken(rawToken)
    });

    const delivery = await this.invitationRepository.createEmailDelivery({
      invitationId: invitation.id,
      provider: "brevo",
      status: "pending"
    });

    try {
      const sendResult = await this.emailProvider.sendInvitation({
        expiresAt: input.expiresAt,
        invitationUrl: `${env.appBaseUrl}/s/${survey.slug}?token=${rawToken}`,
        recipientEmail,
        surveySlug: survey.slug,
        surveyTitle: (await this.surveyRepository.findPublishedVersion(survey.id))?.title ?? survey.slug
      });

      await this.invitationRepository.updateEmailDeliveryStatus({
        deliveryId: delivery.id,
        providerMessageId: sendResult.providerMessageId,
        status: "sent"
      });
    } catch (error) {
      await this.invitationRepository.updateEmailDeliveryStatus({
        deliveryId: delivery.id,
        lastErrorMessage: error instanceof Error ? error.message : "Unknown provider failure.",
        status: "failed"
      });

      throw new AppError(
        ERROR_CODES.invitationSendFailed,
        "Invitation was created but the email provider failed to send it.",
        502
      );
    }

    return this.toListItem(invitation);
  }

  public async listInvitations(surveyId: string, userId: string): Promise<InvitationListItem[]> {
    await this.requireManageableSurvey(surveyId, userId);
    const invitations = await this.invitationRepository.listSurveyInvitations(surveyId);
    return invitations.map((invitation) => this.toListItem(invitation));
  }

  public async revokeInvitation(
    surveyId: string,
    invitationId: string,
    userId: string
  ): Promise<InvitationListItem> {
    await this.requireManageableSurvey(surveyId, userId);
    const invitation = await this.invitationRepository.findInvitationById(invitationId);

    if (!invitation || invitation.surveyId !== surveyId) {
      throw new AppError(ERROR_CODES.invitationNotFound, "Invitation was not found.", 404);
    }

    return this.toListItem(await this.invitationRepository.revokeInvitation(invitationId));
  }

  public async resendInvitation(
    surveyId: string,
    invitationId: string,
    userId: string
  ): Promise<InvitationListItem> {
    const survey = await this.requireManageableSurvey(surveyId, userId);
    const invitation = await this.invitationRepository.findInvitationById(invitationId);

    if (!invitation || invitation.surveyId !== surveyId) {
      throw new AppError(ERROR_CODES.invitationNotFound, "Invitation was not found.", 404);
    }

    if (invitation.revokedAt) {
      throw new AppError(
        ERROR_CODES.invitationResendNotAllowed,
        "Revoked invitations cannot be resent.",
        400
      );
    }

    if (!invitation.recipientEmailCiphertext) {
      throw new AppError(ERROR_CODES.invitationSendFailed, "The invitation email could not be recovered.", 500);
    }

    const rawToken = createSecureToken();
    const rotatedInvitation = await this.invitationRepository.rotateInvitationToken({
      invitationId,
      tokenHash: hashToken(rawToken),
      updatedBy: userId
    });

    const delivery = await this.invitationRepository.createEmailDelivery({
      invitationId: rotatedInvitation.id,
      provider: "brevo",
      status: "pending"
    });

    try {
      const recipientEmail = decryptEmail(invitation.recipientEmailCiphertext);
      const sendResult = await this.emailProvider.sendInvitation({
        expiresAt: rotatedInvitation.expiresAt,
        invitationUrl: `${env.appBaseUrl}/s/${survey.slug}?token=${rawToken}`,
        recipientEmail,
        surveySlug: survey.slug,
        surveyTitle: (await this.surveyRepository.findPublishedVersion(survey.id))?.title ?? survey.slug
      });

      await this.invitationRepository.updateEmailDeliveryStatus({
        deliveryId: delivery.id,
        providerMessageId: sendResult.providerMessageId,
        status: "sent"
      });
    } catch (error) {
      await this.invitationRepository.updateEmailDeliveryStatus({
        deliveryId: delivery.id,
        lastErrorMessage: error instanceof Error ? error.message : "Unknown provider failure.",
        status: "failed"
      });
      throw new AppError(ERROR_CODES.invitationSendFailed, "The invitation email could not be resent.", 502);
    }

    return this.toListItem(rotatedInvitation);
  }

  private async requireManageableSurvey(surveyId: string, userId: string) {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyPublishPermission(membership);
    return survey;
  }

  private toListItem(invitation: SurveyInvitation): InvitationListItem {
    return {
      ...invitation,
      recipientEmail: invitation.recipientEmailCiphertext
        ? decryptEmail(invitation.recipientEmailCiphertext)
        : null
    };
  }
}
