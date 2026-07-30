from flask_jwt_extended import get_jwt_identity

from portal.models.doctor import Doctor


def get_current_doctor():
    """Resolves the Doctor row for the currently authenticated JWT user, or None."""
    user_id = get_jwt_identity()
    return Doctor.query.filter_by(user_id=user_id).first()
