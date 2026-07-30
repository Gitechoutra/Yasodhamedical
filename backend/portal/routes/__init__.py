from portal.routes.auth_routes import auth_bp
from portal.routes.dashboard_routes import dashboard_bp
from portal.routes.patient_routes import patient_bp
from portal.routes.consultation_routes import consultation_bp
from portal.routes.department_routes import department_bp
from portal.routes.appointment_routes import appointment_bp
from portal.routes.doctor_routes import doctor_bp
from portal.routes.report_routes import report_bp


def register_routes(app):
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(patient_bp, url_prefix="/api/patients")
    app.register_blueprint(consultation_bp, url_prefix="/api/consultations")
    app.register_blueprint(department_bp, url_prefix="/api/departments")
    app.register_blueprint(appointment_bp, url_prefix="/api/appointments")
    app.register_blueprint(doctor_bp, url_prefix="/api/doctors")
    app.register_blueprint(report_bp, url_prefix="/api/reports")
