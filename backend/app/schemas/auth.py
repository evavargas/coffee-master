"""Request and response models for the auth endpoints."""

from pydantic import BaseModel, EmailStr, Field

from app.agent.prompt_guard import NAME_MAX_LENGTH

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=NAME_MAX_LENGTH, examples=["Ana"])
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)


class EmailRequest(BaseModel):
    email: EmailStr


class ConfirmEmailRequest(BaseModel):
    token: str = Field(min_length=1, max_length=2048)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1, max_length=2048)
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Token lifetime in seconds")


class MessageResponse(BaseModel):
    message: str


class UserPublic(BaseModel):
    id: int
    name: str
    email: EmailStr
