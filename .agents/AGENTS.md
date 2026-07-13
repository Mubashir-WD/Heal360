# Project-Specific Coding Standards

## 1. Sequential Employee ID Generation (HM-XXX)
* When creating new employees, the system must auto-generate sequential IDs starting from `HM-001`.
* Do NOT use random number generators for IDs to avoid collisions.
* Always query the current database records, find the maximum existing numerical index (e.g., `HM-006` -> `6`), and increment it by `1` with 3-digit padding (e.g., `HM-` + `007`).
* Enforce strict client-side uniqueness checks on both create and edit forms to prevent assigning duplicate IDs.

## 2. Permanent Deletion & Authentication Guards
* Do not use "disabling" for employee suspension; employees must be permanently deleted from the `users` Firestore collection upon request.
* Because Firebase Auth user records persist on client devices, the application must enforce an authentication gateway: on auth state change, if the corresponding Firestore document does not exist, the system must immediately terminate the session (`signOut`) and redirect to `login.html` rather than recreating a blank profile document.
