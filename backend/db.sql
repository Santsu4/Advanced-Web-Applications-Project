CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE screens (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    capacity INT NOT NULL CHECK (capacity IN (100, 200)),
    wheelchair_capacity INT NOT NULL DEFAULT 10
);

CREATE TABLE seats (
    id SERIAL PRIMARY KEY,
    screen_id INT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    physical_row INT NOT NULL,
    row_label INT NOT NULL CHECK (row_label != 13),
    seat_label INT NOT NULL CHECK (seat_label != 13),
    is_wheelchair BOOLEAN NOT NULL DEFAULT FALSE,
    is_ceo_reserved BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE films (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    metadata_api_id VARCHAR(100),
    description TEXT,
    artwork_url TEXT
);

CREATE TABLE screenings (
    id SERIAL PRIMARY KEY,
    film_id INT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
    screen_id INT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    screening_time TIMESTAMP NOT NULL
);

CREATE TABLE prices (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL CHECK (category IN ('adult', 'child', 'company')),
    amount_cents INT NOT NULL
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    role VARCHAR(50) NOT NULL DEFAULT 'customer' CHECK (role IN ('administrator', 'cashier', 'customer')),
    permitted_city_id INT REFERENCES cities(id) ON DELETE SET NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    loyalty_progress INT NOT NULL DEFAULT 0 CHECK (loyalty_progress >= 0 AND loyalty_progress <= 9)
);

CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    guest_email VARCHAR(255),
    screening_id INT NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('hold', 'reserved', 'paid', 'expired', 'company_invoiced')),
    booking_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiry_time TIMESTAMP,
    CONSTRAINT chk_customer_contact CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL)
);

CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    seat_id INT NOT NULL REFERENCES seats(id),
    price_id INT REFERENCES prices(id),
    is_loyalty_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
    amount_charged INT NOT NULL
);

CREATE TABLE company_requests (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    film_id INT REFERENCES films(id) ON DELETE SET NULL,
    screening_id INT REFERENCES screenings(id) ON DELETE SET NULL,
    attendee_count INT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    message TEXT
);

CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT FALSE
);


/* Hardcoded CEO seat 1 protection */
CREATE OR REPLACE FUNCTION prevent_ceo_seat_booking()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM seats 
        WHERE id = NEW.seat_id AND is_ceo_reserved = TRUE
    ) THEN
        RAISE EXCEPTION 'System Lock: CEO reserved seats (Seat 1) cannot be sold or reserved.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_ceo_seat_booking
BEFORE INSERT OR UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION prevent_ceo_seat_booking();

CREATE OR REPLACE FUNCTION protect_ceo_seat_config()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.seat_label = 1 THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'System Lock: Seat 1 cannot be deleted from the system.';
        END IF;
        
        IF TG_OP = 'UPDATE' AND (NEW.is_ceo_reserved = FALSE OR NEW.seat_label != 1) THEN
            RAISE EXCEPTION 'System Lock: Seat 1 cannot be released or reassigned.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_ceo_seat_config
BEFORE UPDATE OR DELETE ON seats
FOR EACH ROW EXECUTE FUNCTION protect_ceo_seat_config();

/*
Locations & Screens: The screens table enforces the exact capacities of 100 or 200 seats via a CHECK constraint, and the wheelchair_capacity correctly defaults to the ten mandatory spaces.   

Seat Rules: row_label and seat_label are configured as integers with explicit CHECK constraints to prevent the number 13 from being used. The is_ceo_reserved flag protects seat 1 from standard allocation.   

Role & Access Control: The users table introduces a permitted_city_id field to ensure cashiers can be strictly scoped to their assigned city (Oulu or Tampere). The role column strictly accepts 'administrator', 'cashier', or 'customer'.   

Guest Checkout Validation: The bookings table includes a guest_email field and a chk_customer_contact constraint to ensure a booking always has an associated user account or a guest email.   

Booking Status & Deadlines: The bookings table restricts statuses to accurately reflect checkout flow ('hold'), registered reservations ('reserved'), finalized orders ('paid' or 'company_invoiced'), or released places ('expired').   

Loyalty Progress Guardrails: The loyalty_progress field enforces a maximum integer of 9 via a CHECK constraint, ensuring the modulus math behavior described in the stories operates securely at the database level.   

Company Requests: The company_requests table was expanded to include a contact_email so staff can notify the company representative of acceptance or refusal, and standardizes statuses to 'pending', 'accepted', or 'declined'.   
*/