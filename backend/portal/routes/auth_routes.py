import os
import re
from datetime import datetime

from flask import Blueprint, request, send_from_directory
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required

from portal.extensions import db
from portal.helpers.response import error, success
from portal.helpers.uploads import ImageUploadError, delete_image, save_image, upload_dir
from portal.models.user import User

auth_bp = Blueprint("auth", __name__)

AVATARS_SUBDIR = "avatars"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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


@auth_bp.patch("/me")
@jwt_required()
def update_me():
    """Lets a signed-in user edit their own account details.

    Deliberately narrow: role, is_active and department are org structure, not
    self-service — changing those stays an admin action.
    """
    user = User.query.get(get_jwt_identity())
    if not user:
        return error("User not found", status=404)

    payload = request.get_json(silent=True) or {}

    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            return error("Name cannot be empty", status=422)
        user.name = name

    if "email" in payload:
        email = (payload.get("email") or "").strip().lower()
        if not EMAIL_RE.match(email):
            return error("Enter a valid email address", status=422)
        clash = User.query.filter(User.email == email, User.id != user.id).first()
        if clash:
            return error("That email is already in use", status=409)
        user.email = email

    # Doctor-only fields live on the doctor profile, not the user row.
    if user.doctor_profile:
        if "specialization" in payload:
            user.doctor_profile.specialization = (payload.get("specialization") or "").strip() or None
        if "registration_no" in payload:
            user.doctor_profile.registration_no = (payload.get("registration_no") or "").strip() or None

    db.session.commit()
    return success(user.to_dict(), message="Profile updated")


@auth_bp.post("/me/avatar")
@jwt_required()
def upload_avatar():
    user = User.query.get(get_jwt_identity())
    if not user:
        return error("User not found", status=404)

    try:
        filename = save_image(request.files.get("avatar"), AVATARS_SUBDIR)
    except ImageUploadError as exc:
        return error(exc.message, status=exc.status)

    previous = user.avatar_path
    user.avatar_path = filename
    db.session.commit()

    delete_image(previous, AVATARS_SUBDIR)

    return success(user.to_dict(), message="Profile picture updated")


@auth_bp.delete("/me/avatar")
@jwt_required()
def delete_avatar():
    user = User.query.get(get_jwt_identity())
    if not user:
        return error("User not found", status=404)

    previous = user.avatar_path
    user.avatar_path = None
    db.session.commit()

    delete_image(previous, AVATARS_SUBDIR)

    return success(user.to_dict(), message="Profile picture removed")


@auth_bp.get("/avatar/<path:filename>")
def serve_avatar(filename):
    """Serves an avatar image.

    Unauthenticated on purpose: an <img> tag cannot send the Authorization
    header, and blob-fetching every avatar would defeat browser caching. The
    filename is 32 random hex chars, so a URL is only reachable by someone
    who was already shown it. send_from_directory rejects traversal itself.
    """
    directory = upload_dir(AVATARS_SUBDIR)
    if not os.path.exists(os.path.join(directory, filename)):
        return error("Image not found", status=404)
    return send_from_directory(directory, filename, max_age=3600)


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
