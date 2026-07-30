from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.response import error, success
from portal.models.user import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or not password:
        return error("Email and password are required", status=422)

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return error("Invalid email or password", status=401)

    if not user.is_active:
        return error("This account has been deactivated", status=403)

    claims = {"role": user.role.name}
    access_token = create_access_token(identity=str(user.id), additional_claims=claims)
    refresh_token = create_refresh_token(identity=str(user.id), additional_claims=claims)

    user.last_login_at = datetime.utcnow()
    db.session.commit()

    return success(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user.to_dict(),
        },
        message="Login successful",
    )


@auth_bp.get("/me")
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return error("User not found", status=404)
    return success(user.to_dict())


@auth_bp.post("/password")
@jwt_required()
def change_password():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return error("User not found", status=404)

    payload = request.get_json(silent=True) or {}
    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""

    if not user.check_password(current_password):
        # Deliberately not 401: the frontend's global interceptor treats any
        # 401 as "session expired" and force-logs-out — but this is just a
        # wrong secondary credential, not an invalid/expired JWT.
        return error("Current password is incorrect", status=422)
    if len(new_password) < 6:
        return error("New password must be at least 6 characters", status=422)

    user.set_password(new_password)
    db.session.commit()

    return success(message="Password updated")


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    from flask_jwt_extended import get_jwt

    user_id = get_jwt_identity()
    claims = {"role": get_jwt().get("role")}
    access_token = create_access_token(identity=user_id, additional_claims=claims)
    return success({"access_token": access_token})


@auth_bp.post("/logout")
@jwt_required()
def logout():
    # Stateless JWT: the client discards the token. A server-side revocation
    # list can be added later if we need immediate invalidation.
    return success(message="Logged out")
