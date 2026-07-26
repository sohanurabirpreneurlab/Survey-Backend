import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { authenticateUser } from "../../common/middleware/authenticate-user";
import { validateRequest } from "../../common/middleware/validate-request";
import {
  getCurrentUser,
  login,
  logout,
  refresh,
  register
} from "./auth.controller";
import {
  loginValidators,
  refreshValidators,
  registerValidators
} from "./auth.schemas";

const authRouter = Router();

authRouter.post("/register", registerValidators, validateRequest, asyncHandler(register));
authRouter.post("/login", loginValidators, validateRequest, asyncHandler(login));
authRouter.get("/me", authenticateUser, asyncHandler(getCurrentUser));
authRouter.post("/logout", authenticateUser, asyncHandler(logout));
authRouter.post("/refresh", refreshValidators, validateRequest, asyncHandler(refresh));
// Password reset routes are intentionally disabled for now.

export { authRouter };
