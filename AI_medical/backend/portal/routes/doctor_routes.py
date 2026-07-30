from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from portal.extensions import db
from portal.helpers.decorators import role_required
from portal.helpers.response import error, success
from portal.models.department import Department
from portal.models.doctor import Doctor
from portal.models.role import Role
from portal.models.user import User

doctor_bp = Blueprint("doctors", __name__)


@doctor_bp.get("")
@jwt_required()
def list_doctors():
    query = Doctor.query.join(Doctor.user).order_by(Doctor.department_id)

    department_id = request.args.get("department_id", type=int)
    if department_id:
        query = query.filter(Doctor.department_id == department_id)

    return success([d.to_dict() for d in query.all()])


@doctor_bp.post("")
@role_required("admin")
def create_doctor():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    department_id = payload.get("department_id")

    if not name or not email or not password or not department_id:
        return error("name, email, password, and department_id are required", status=422)

    if User.query.filter_by(email=email).first():
        return error("A user with this email already exists", status=409)

    if not Department.query.get(department_id):
        return error("Department not found", status=404)

    doctor_role = Role.query.filter_by(name="doctor").first()

    user = User(name=name, email=email, role_id=doctor_role.id)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()  # assigns user.id before the Doctor row references it

    doctor = Doctor(
        user_id=user.id,
        department_id=department_id,
        specialization=payload.get("specialization") or None,
        registration_no=payload.get("registration_no") or None,
    )
    db.session.add(doctor)
    db.session.commit()

    return success(doctor.to_dict(), message="Doctor created", status=201)
