-- Yasodha AI Medical Assistant
-- Milestone 1 schema: enough to support auth + dashboard.
-- Additional tables (appointments, medicine_categories, prescription_templates,
-- conversation_messages, prescriptions, reports, notifications) are stubbed
-- here for reference and will be filled out functionally in later milestones.

CREATE DATABASE IF NOT EXISTS hospital
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE hospital;

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,   -- admin | doctor | receptionist
    description VARCHAR(255) NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Users (login identity, shared by admin/doctor/receptionist)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id       INT UNSIGNED NOT NULL,
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    last_login_at DATETIME NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE INDEX idx_users_role_id ON users(role_id);

-- ---------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------
CREATE TABLE departments (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Doctors (extends users)
-- ---------------------------------------------------------------------
CREATE TABLE doctors (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id          INT UNSIGNED NOT NULL UNIQUE,
    department_id    INT UNSIGNED NULL,
    specialization   VARCHAR(150) NULL,
    registration_no  VARCHAR(50) NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_doctors_department FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE INDEX idx_doctors_department_id ON doctors(department_id);

-- ---------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------
CREATE TABLE patients (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(150) NOT NULL,
    gender           ENUM('male','female','other') NULL,
    dob              DATE NULL,
    phone            VARCHAR(20) NULL,
    email            VARCHAR(150) NULL,
    blood_group      VARCHAR(5) NULL,
    allergies        TEXT NULL,
    medical_history  TEXT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Medicines (hospital formulary — prescriptions must draw from here)
-- ---------------------------------------------------------------------
CREATE TABLE medicines (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name              VARCHAR(150) NOT NULL,
    category          VARCHAR(100) NULL,
    default_dose      VARCHAR(50) NULL,
    default_frequency VARCHAR(50) NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_medicines_name ON medicines(name);

-- ---------------------------------------------------------------------
-- Consultations (created now so dashboard widgets have real data;
-- the live voice consultation flow itself is built in a later milestone)
-- ---------------------------------------------------------------------
CREATE TABLE consultations (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doctor_id   INT UNSIGNED NOT NULL,
    patient_id  INT UNSIGNED NOT NULL,
    status      ENUM('scheduled','in_progress','completed') NOT NULL DEFAULT 'scheduled',
    started_at  DATETIME NULL,
    ended_at    DATETIME NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_consultations_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id),
    CONSTRAINT fk_consultations_patient FOREIGN KEY (patient_id) REFERENCES patients(id)
) ENGINE=InnoDB;

CREATE INDEX idx_consultations_doctor_started ON consultations(doctor_id, started_at);
CREATE INDEX idx_consultations_status ON consultations(status);

-- ---------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NULL,
    action     VARCHAR(100) NOT NULL,
    entity     VARCHAR(100) NULL,
    entity_id  INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
