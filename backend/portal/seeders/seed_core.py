from portal.extensions import db
from portal.models.department import Department
from portal.models.doctor import Doctor
from portal.models.medicine import Medicine
from portal.models.nurse import Nurse
from portal.models.role import Role
from portal.models.user import User

ROLE_NAMES = ["admin", "doctor", "nurse", "receptionist"]

DEPARTMENTS = ["Orthopedics", "Gynecology", "Gastroenterology", "General Medicine"]

FORMULARY = [
    ("Paracetamol 650mg", "Analgesic/Antipyretic", "1 Tablet", "Every 6 hours"),
    ("Vitamin C 500mg", "Supplement", "1 Tablet", "Once Daily"),
    ("Zincovit Tablet", "Supplement", "1 Tablet", "Once Daily"),
    ("ORS", "Rehydration", "1 Sachet", "As needed"),
    ("Cetirizine 10mg", "Antihistamine", "1 Tablet", "Once Daily"),
    ("Amoxicillin 500mg", "Antibiotic", "1 Capsule", "Every 8 hours"),
    ("Ibuprofen 400mg", "NSAID", "1 Tablet", "Every 8 hours"),
    ("Omeprazole 20mg", "Antacid", "1 Capsule", "Once Daily, before food"),
    ("Cough Syrup (Dextromethorphan)", "Antitussive", "10ml", "Every 8 hours"),
]

# (name, email, password, department, specialization, registration_no)
DOCTORS = [
    (
        "Dr. Sandeep Viswanadh",
        "sandeep.viswanadh@yasodhahospitals.com",
        "Doctor@123",
        "Orthopedics",
        "Orthopedic Surgeon",
        "12545",
    ),
    (
        "Dr. Sahithi",
        "sahithi@yasodhahospitals.com",
        "Doctor@123",
        "Gynecology",
        "Gynecologist",
        "12678",
    ),
    (
        "Dr. Arjun Mehta",
        "arjun.mehta@yasodhahospitals.com",
        "Doctor@123",
        "Gastroenterology",
        "Gastroenterologist",
        "12811",
    ),
]


# (name, email, password, department, employee_no, shift)
NURSES = [
    (
        "Sr. Lakshmi Rao",
        "lakshmi.rao@yasodhahospitals.com",
        "Nurse@123",
        "Orthopedics",
        "NUR1001",
        "morning",
    ),
    (
        "Sr. Fatima Begum",
        "fatima.begum@yasodhahospitals.com",
        "Nurse@123",
        "Gynecology",
        "NUR1002",
        "evening",
    ),
    (
        "Sr. Joseph Thomas",
        "joseph.thomas@yasodhahospitals.com",
        "Nurse@123",
        "General Medicine",
        "NUR1003",
        "night",
    ),
]


def seed_roles():
    for name in ROLE_NAMES:
        if not Role.query.filter_by(name=name).first():
            db.session.add(Role(name=name, description=f"{name.capitalize()} role"))
    db.session.commit()


def seed_departments():
    departments = {}
    for name in DEPARTMENTS:
        dept = Department.query.filter_by(name=name).first()
        if not dept:
            dept = Department(name=name)
            db.session.add(dept)
            db.session.commit()
        departments[name] = dept
    return departments


def seed_admin():
    admin_role = Role.query.filter_by(name="admin").first()
    if not User.query.filter_by(email="admin@yasodhahospitals.com").first():
        admin = User(name="Admin", email="admin@yasodhahospitals.com", role_id=admin_role.id)
        admin.set_password("Admin@123")
        db.session.add(admin)
        db.session.commit()


def seed_receptionist():
    receptionist_role = Role.query.filter_by(name="receptionist").first()
    if not User.query.filter_by(email="reception@yasodhahospitals.com").first():
        receptionist = User(
            name="Reception Desk",
            email="reception@yasodhahospitals.com",
            role_id=receptionist_role.id,
        )
        receptionist.set_password("Reception@123")
        db.session.add(receptionist)
        db.session.commit()


def seed_doctors(departments):
    doctor_role = Role.query.filter_by(name="doctor").first()
    for name, email, password, dept_name, specialization, reg_no in DOCTORS:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(name=name, email=email, role_id=doctor_role.id)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

        if not Doctor.query.filter_by(user_id=user.id).first():
            doctor = Doctor(
                user_id=user.id,
                department_id=departments[dept_name].id,
                specialization=specialization,
                registration_no=reg_no,
            )
            db.session.add(doctor)
            db.session.commit()


def seed_nurses(departments):
    nurse_role = Role.query.filter_by(name="nurse").first()
    for name, email, password, dept_name, employee_no, shift in NURSES:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(name=name, email=email, role_id=nurse_role.id)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

        if not Nurse.query.filter_by(user_id=user.id).first():
            db.session.add(
                Nurse(
                    user_id=user.id,
                    department_id=departments[dept_name].id,
                    employee_no=employee_no,
                    shift=shift,
                )
            )
            db.session.commit()


def seed_formulary():
    for name, category, dose, frequency in FORMULARY:
        if not Medicine.query.filter_by(name=name).first():
            db.session.add(
                Medicine(name=name, category=category, default_dose=dose, default_frequency=frequency)
            )
    db.session.commit()


def run():
    """Seeds the reference data the app can't run without: roles, departments,
    the formulary and the staff logins.

    Patients are deliberately not seeded. A patient with no assigned doctor is
    invisible to every doctor (see helpers/patient_access), so demo rows only
    ever showed up as clutter on the admin's list — real patients come in
    through the front desk.
    """
    seed_roles()
    departments = seed_departments()
    seed_admin()
    seed_receptionist()
    seed_doctors(departments)
    seed_nurses(departments)
    seed_formulary()
    print("Seed complete.")
    print("  Admin        -> admin@yasodhahospitals.com / Admin@123")
    print("  Receptionist -> reception@yasodhahospitals.com / Reception@123")
    for _name, email, password, dept_name, _spec, _reg in DOCTORS:
        print(f"  Doctor -> {email} / {password}  ({dept_name})")
    for _name, email, password, dept_name, _emp, shift in NURSES:
        print(f"  Nurse  -> {email} / {password}  ({dept_name}, {shift} shift)")
    print(f"  Seeded {len(FORMULARY)} formulary medicines")
