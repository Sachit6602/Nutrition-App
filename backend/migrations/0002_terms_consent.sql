-- Record which version of the Terms/Privacy Policy each account agreed to, and when (DPDP Act consent record).
-- The version string is frontend/src/Legal.jsx TERMS_VERSION, mirrored in backend/auth.js.
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
