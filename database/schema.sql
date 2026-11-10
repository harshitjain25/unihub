-- UniHub database schema
-- Run with: /usr/local/mysql/bin/mysql -u root -p < database/schema.sql
--
-- Safe to run more than once: every table uses IF NOT EXISTS, so existing
-- data is never dropped. If you already have an older UniHub database
-- (from the login assignment or an earlier version), also run:
--   npm run migrate

CREATE DATABASE IF NOT EXISTS unihub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE unihub;

-- ---------------------------------------------------------------------------
-- accounts: one row per person. Reused from the login/registration assignment
-- and extended with a role, the PBKDF2 iteration count, and updated_at.
-- `password` holds the PBKDF2-SHA512 hash, never the plain-text password.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    user_id          INT AUTO_INCREMENT PRIMARY KEY,
    username         VARCHAR(50)  NOT NULL UNIQUE,
    email            VARCHAR(150) NOT NULL UNIQUE,
    password         VARCHAR(128) NOT NULL,
    salt             VARCHAR(64)  NOT NULL,
    hash_iterations  INT UNSIGNED NOT NULL DEFAULT 100000,
    role             ENUM('student', 'admin') NOT NULL DEFAULT 'student',
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- equipment: items students can borrow.
-- available_quantity goes down when a booking is created and back up when a
-- booking is cancelled, rejected, or returned.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(150) NOT NULL,
    category            VARCHAR(80)  NOT NULL,
    description         TEXT         NOT NULL,
    total_quantity      INT UNSIGNED NOT NULL,
    available_quantity  INT UNSIGNED NOT NULL,
    status              ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (total_quantity > 0),
    CHECK (available_quantity <= total_quantity),
    INDEX (category)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- bookings: one student borrowing a quantity of one equipment item.
-- ON DELETE RESTRICT keeps booking history: equipment or accounts that have
-- bookings cannot be deleted by accident (set equipment inactive instead).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT          NOT NULL,
    equipment_id  INT UNSIGNED NOT NULL,
    start_date    DATE         NOT NULL,
    end_date      DATE         NOT NULL,
    quantity      INT UNSIGNED NOT NULL,
    status        ENUM('pending', 'approved', 'rejected', 'returned', 'cancelled') NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bookings_account   FOREIGN KEY (user_id)      REFERENCES accounts (user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_equipment FOREIGN KEY (equipment_id) REFERENCES equipment (id)     ON DELETE RESTRICT,
    INDEX (user_id, status),
    CHECK (quantity > 0),
    CHECK (end_date >= start_date)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- lost_found_items: a report of a lost or found item, owned by its creator.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lost_found_items (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id        INT          NOT NULL,
    item_name      VARCHAR(150) NOT NULL,
    category       VARCHAR(80)  NOT NULL,
    report_type    ENUM('Lost', 'Found') NOT NULL,
    description    TEXT         NOT NULL,
    location       VARCHAR(255) NOT NULL,
    item_date      DATE         NOT NULL,
    contact_email  VARCHAR(150) NOT NULL,
    status         ENUM('Open', 'Resolved') NOT NULL DEFAULT 'Open',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_lost_found_account FOREIGN KEY (user_id) REFERENCES accounts (user_id) ON DELETE RESTRICT,
    INDEX (status, report_type),
    INDEX (user_id)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- volunteer_opportunities: events students can sign up for.
-- Remaining slots are calculated as total_slots minus the number of signups.
-- Status moves between 'active' and 'full' automatically as people join/leave.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS volunteer_opportunities (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title         VARCHAR(150) NOT NULL,
    organization  VARCHAR(150) NOT NULL,
    description   TEXT         NOT NULL,
    location      VARCHAR(255) NOT NULL,
    event_date    DATE         NOT NULL,
    start_time    TIME         NOT NULL,
    end_time      TIME         NOT NULL,
    total_slots   INT UNSIGNED NOT NULL,
    status        ENUM('active', 'full', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (total_slots > 0),
    CHECK (end_time > start_time),
    INDEX (event_date)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- volunteer_signups: which account joined which opportunity.
-- UNIQUE (user_id, opportunity_id) makes duplicate registrations impossible.
-- Deleting an opportunity also deletes its signups (CASCADE).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS volunteer_signups (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT          NOT NULL,
    opportunity_id  INT UNSIGNED NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, opportunity_id),
    CONSTRAINT fk_signups_account     FOREIGN KEY (user_id)        REFERENCES accounts (user_id)              ON DELETE RESTRICT,
    CONSTRAINT fk_signups_opportunity FOREIGN KEY (opportunity_id) REFERENCES volunteer_opportunities (id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Creating an administrator (no password is ever stored in this file):
--   1. Register normally at http://localhost:3000/register.html
--   2. Run:  UPDATE unihub.accounts SET role = 'admin' WHERE username = 'chosen_username';
-- ---------------------------------------------------------------------------
