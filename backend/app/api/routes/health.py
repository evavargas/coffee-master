from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", summary="Health check", description="Returns ok when the API is running.")
def health() -> dict[str, str]:
    return {"status": "ok"}
