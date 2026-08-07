from portal.extensions import db
from portal.models.department import Department
from portal.models.doctor import Doctor
from portal.models.medicine import Medicine
from portal.models.branch import Branch
from portal.models.medicine_brand import MedicineBrand, StockBatch
from portal.models.nurse import Nurse
from portal.models.pharmacist import Pharmacist
from portal.models.role import DEFAULT_ROLES, Role
from portal.models.staff_profile import StaffProfile
from portal.models.user import User

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
#
# The trailing shift is no longer seeded onto the nurse profile — shifts are
# rostered by an administrator on the shift schedule, per date, and a seeded
# "normal" shift was a fact nobody had entered and nobody could rely on. The
# value is kept in this table only so the tuples still describe the intent
# behind each demo account.
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


# (name, code, city). Cross-branch search is meaningless with one branch, so
# the seed ships three.
BRANCHES = [
    ("Yasodha Hospitals — Kakinada", "KKD", "Kakinada"),
    ("Yasodha Hospitals — Rajahmundry", "RJY", "Rajahmundry"),
    ("Yasodha Hospitals — Vizag", "VZG", "Visakhapatnam"),
]

# (name, email, password, department, lab department, employee code)
# Seeded so a fresh install has a working laboratory: a doctor ordering a test
# needs somebody to assign it to.
LAB_TECHNICIANS = [
    (
        "Anita Sharma",
        "anita.lab@yasodhahospitals.com",
        "LabTech@123",
        "General Medicine",
        "Haematology",
        "LAB2001",
    ),
    (
        "Kiran Babu",
        "kiran.lab@yasodhahospitals.com",
        "LabTech@123",
        "General Medicine",
        "Biochemistry",
        "LAB2002",
    ),
]

# (name, email, password, branch code, license no)
PHARMACISTS = [
    ("Ravi Teja", "ravi.pharmacy@yasodhahospitals.com", "Pharma@123", "KKD", "AP-PH-4471"),
    ("Sneha Reddy", "sneha.pharmacy@yasodhahospitals.com", "Pharma@123", "RJY", "AP-PH-5528"),
]

# (brand, generic, used_for, category, manufacturer, form, strength, {branch: qty})
# Spread across branches on purpose: some brands are missing from Kakinada so
# the cross-branch lookup has something real to find.
BRAND_CATALOGUE = [
    ("Dolo 650", "Paracetamol", "Fever, mild to moderate pain, headache, body ache",
     "Analgesic/Antipyretic", "Micro Labs", "tablet", "650mg", {"KKD": 240, "RJY": 180, "VZG": 90}),
    ("Crocin Advance", "Paracetamol", "Fever and headache relief",
     "Analgesic/Antipyretic", "GSK", "tablet", "500mg", {"KKD": 60, "VZG": 120}),
    ("Augmentin 625 Duo", "Amoxicillin + Clavulanic Acid",
     "Bacterial infections of the chest, throat, skin and urinary tract",
     "Antibiotic", "GSK", "tablet", "625mg", {"KKD": 45, "RJY": 80}),
    ("Azithral 500", "Azithromycin", "Respiratory, skin and ENT bacterial infections",
     "Antibiotic", "Alembic", "tablet", "500mg", {"RJY": 65, "VZG": 40}),
    ("Pan 40", "Pantoprazole", "Acidity, gastric reflux, stomach ulcers",
     "Antacid", "Alkem", "tablet", "40mg", {"KKD": 150, "RJY": 95}),
    ("Zerodol SP", "Aceclofenac + Paracetamol + Serratiopeptidase",
     "Pain and swelling in arthritis, injury and post-surgery",
     "NSAID", "Ipca", "tablet", "100mg", {"KKD": 18, "VZG": 70}),
    ("Cetzine", "Cetirizine", "Allergy, running nose, sneezing, skin rash",
     "Antihistamine", "GSK", "tablet", "10mg", {"KKD": 200, "RJY": 140}),
    ("Normal Saline 0.9%", "Sodium Chloride", "IV fluid for dehydration and electrolyte balance",
     "IV Fluid", "Baxter", "iv_fluid", "500ml", {"KKD": 35, "RJY": 50, "VZG": 25}),
    ("Ondem 4", "Ondansetron", "Nausea and vomiting, including post-operative",
     "Antiemetic", "Alkem", "injection", "4mg", {"RJY": 30}),
    ("Ascoril LS", "Levosalbutamol + Ambroxol + Guaifenesin",
     "Wet cough with chest congestion", "Antitussive", "Glenmark", "syrup", "100ml",
     {"VZG": 55}),
]


def seed_branches():
    branches = {}
    for name, code, city in BRANCHES:
        branch = Branch.query.filter_by(code=code).first()
        if not branch:
            branch = Branch(name=name, code=code, city=city)
            db.session.add(branch)
            db.session.commit()
        branches[code] = branch
    return branches


def seed_pharmacists(branches):
    role = Role.query.filter_by(name="pharmacist").first()
    for name, email, password, branch_code, license_no in PHARMACISTS:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(name=name, email=email, role_id=role.id)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
        if not Pharmacist.query.filter_by(user_id=user.id).first():
            db.session.add(
                Pharmacist(
                    user_id=user.id,
                    branch_id=branches[branch_code].id,
                    license_no=license_no,
                )
            )
            db.session.commit()


def seed_pharmacy_catalogue(branches):
    from datetime import date, timedelta

    for (brand_name, generic, used_for, category, maker, form, strength, stock) in BRAND_CATALOGUE:
        brand = MedicineBrand.query.filter_by(brand_name=brand_name, strength=strength).first()
        if not brand:
            brand = MedicineBrand(
                brand_name=brand_name,
                generic_name=generic,
                used_for=used_for,
                category=category,
                manufacturer=maker,
                form=form,
                strength=strength,
                # Link to the clinical formulary where the generic matches, so
                # a prescription can be filled with this brand.
                medicine_id=(
                    Medicine.query.filter(Medicine.name.ilike(f"%{generic.split()[0]}%")).first().id
                    if Medicine.query.filter(Medicine.name.ilike(f"%{generic.split()[0]}%")).first()
                    else None
                ),
            )
            db.session.add(brand)
            db.session.commit()

        for branch_code, quantity in stock.items():
            branch = branches[branch_code]
            exists = StockBatch.query.filter_by(branch_id=branch.id, brand_id=brand.id).first()
            if not exists:
                db.session.add(
                    StockBatch(
                        branch_id=branch.id,
                        brand_id=brand.id,
                        batch_no=f"B{brand.id:03d}{branch.code}",
                        expiry_date=date.today() + timedelta(days=420),
                        quantity=quantity,
                        mrp=round(12 + brand.id * 7.5, 2),
                        cost_price=round((12 + brand.id * 7.5) * 0.72, 2),
                    )
                )
        db.session.commit()


def seed_roles():
    """Reconciles the roles table against models/role.DEFAULT_ROLES.

    Migration 9a51dd64f4ba already guarantees these exist, so this is a
    belt-and-braces pass for a database that predates it — and it refreshes
    descriptions, so editing the wording in one place is enough.
    """
    for name, description in DEFAULT_ROLES:
        role = Role.query.filter_by(name=name).first()
        if role:
            role.description = description
        else:
            db.session.add(Role(name=name, description=description))
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
    for name, email, password, dept_name, employee_no, _shift in NURSES:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(name=name, email=email, role_id=nurse_role.id)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

        if not Nurse.query.filter_by(user_id=user.id).first():
            # No `shift=`: a nurse starts with no rostered shift at all, and
            # gets one only when an administrator schedules it.
            db.session.add(
                Nurse(
                    user_id=user.id,
                    department_id=departments[dept_name].id,
                    employee_no=employee_no,
                )
            )
            db.session.commit()


def seed_lab_technicians(departments):
    """Lab technicians have no operational profile table of their own — the
    laboratory joins on `users` directly — so this only needs the account and
    the HR profile that holds which bench they work."""
    role = Role.query.filter_by(name="lab_technician").first()
    for name, email, password, dept_name, lab_department, employee_code in LAB_TECHNICIANS:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(name=name, email=email, role_id=role.id)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

        if not StaffProfile.query.filter_by(user_id=user.id).first():
            db.session.add(
                StaffProfile(
                    user_id=user.id,
                    department_id=departments[dept_name].id,
                    lab_department=lab_department,
                    employee_code=employee_code,
                    designation="Lab Technician",
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
    branches = seed_branches()
    seed_lab_technicians(departments)
    seed_pharmacists(branches)
    seed_pharmacy_catalogue(branches)
    print("Seed complete.")
    print("  Admin        -> admin@yasodhahospitals.com / Admin@123")
    print("  Receptionist -> reception@yasodhahospitals.com / Reception@123")
    for _name, email, password, dept_name, _spec, _reg in DOCTORS:
        print(f"  Doctor -> {email} / {password}  ({dept_name})")
    for _name, email, password, dept_name, _emp, _shift in NURSES:
        print(f"  Nurse  -> {email} / {password}  ({dept_name})")
    for _name, email, password, _dept, lab_dept, _emp in LAB_TECHNICIANS:
        print(f"  Lab    -> {email} / {password}  ({lab_dept})")
    for _name, email, password, branch_code, _lic in PHARMACISTS:
        print(f"  Pharmacy -> {email} / {password}  ({branch_code})")
    print(f"  Seeded {len(FORMULARY)} formulary medicines, "
          f"{len(BRANCHES)} branches, {len(BRAND_CATALOGUE)} pharmacy brands")
