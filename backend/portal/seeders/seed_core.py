from portal.extensions import db
from portal.models.department import Department
from portal.models.doctor import Doctor
from portal.models.medicine import Medicine
from portal.models.patient import Patient
from portal.models.role import Role
from portal.models.user import User

ROLE_NAMES = ["admin", "doctor", "receptionist"]

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

DEMO_PATIENTS = [
    dict(name="Ravi Kumar", gender="male", phone="+91 98765 43210", blood_group="O+"),
    dict(name="Anita Sharma", gender="female", phone="+91 98765 11223", blood_group="B+"),
    dict(name="Vikram Patel", gender="male", phone="+91 98765 44556", blood_group="A+"),
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
        "Dr. Priya Nair",
        "priya.nair@yasodhahospitals.com",
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


def seed_formulary():
    for name, category, dose, frequency in FORMULARY:
        if not Medicine.query.filter_by(name=name).first():
            db.session.add(
                Medicine(name=name, category=category, default_dose=dose, default_frequency=frequency)
            )
    db.session.commit()


def seed_demo_patients():
    for p in DEMO_PATIENTS:
        if not Patient.query.filter_by(name=p["name"]).first():
            db.session.add(Patient(**p))
    db.session.commit()


def run():
    seed_roles()
    departments = seed_departments()
    seed_admin()
    seed_receptionist()
    seed_doctors(departments)
    seed_formulary()
    seed_demo_patients()
    print("Seed complete.")
    print("  Admin        -> admin@yasodhahospitals.com / Admin@123")
    print("  Receptionist -> reception@yasodhahospitals.com / Reception@123")
    for name, email, password, dept_name, _spec, _reg in DOCTORS:
        print(f"  Doctor -> {email} / {password}  ({dept_name})")
    print(f"  Seeded {len(FORMULARY)} formulary medicines, {len(DEMO_PATIENTS)} demo patients")
