# DABuddy - Thesis Management System

A comprehensive thesis management system designed as a companion application for bachelor's degree programs. DABuddy helps manage the relationship between students, coaches, and experts throughout the thesis process.

## Features

- **Role-based Authentication**: Separate interfaces for students, coaches, and experts
- **Year-based Management**: Select academic year during login to filter relevant data
- **Thesis Tracking**: Complete thesis lifecycle management
- **User Management**: Support for multiple user roles with appropriate permissions
- **Responsive Design**: Modern Bootstrap-based UI that works on all devices

## User Roles

- **Students**: View their assigned thesis and contact information for coaches/experts
- **Coaches**: Manage multiple theses they supervise
- **Experts**: Review and evaluate assigned theses

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- npm or yarn package manager

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd DABuddy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your database credentials.

4. Set up the database and seed with sample data:
   ```bash
   npm run seed
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`.

## Sample Accounts

After running the seed script, you can login with these accounts:

### Students
- Username: `student1`, Password: `password123` (Max Müller)
- Username: `student2`, Password: `password123` (Anna Schmidt)

### Coaches
- Username: `coach1`, Password: `password123` (Dr. Thomas Weber)
- Username: `coach2`, Password: `password123` (Prof. Sarah Fischer)

### Experts
- Username: `expert1`, Password: `password123` (Dr. Michael Meyer)
- Username: `expert2`, Password: `password123` (Prof. Lisa Wagner)

**Note**: All accounts can login with year: 2024

## Database Schema

### Core Tables
- **Users**: Store user information with roles (student, coach, expert)
- **Departments**: Academic departments
- **Years**: Academic years for thesis management
- **Theses**: Central thesis information

### Relationship Tables
- **thesis_students**: Links students to their thesis (1-2 students per thesis)
- **thesis_coaches**: Links coaches to theses they supervise
- **thesis_experts**: Links experts to theses they evaluate

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Frontend**: EJS templates with Bootstrap 5
- **Authentication**: Express-session with bcrypt password hashing
- **Session Storage**: Database-backed sessions

## Scripts

- `npm start`: Start production server
- `npm run dev`: Start development server with nodemon
- `npm run seed`: Reset database and populate with sample data

## Mail-Konfiguration (.env)

Die Applikation versendet Mail-Erinnerungen an Bewerter und Approver. SMTP wird
ausschliesslich über `.env` konfiguriert:

```env
MAIL_HOST=smtp.office365.com
MAIL_PORT=587
MAIL_SECURE=false               # true nur bei SSL/465
MAIL_USER=noreply@…
MAIL_PASS=…
MAIL_FROM=ThesisBuddy <noreply@…>

# Optional: alle Mails auf eine Adresse umleiten (Produktions-Testing).
# Der eigentliche Empfänger erscheint im Betreff als "[→ user@…]".
MAIL_OVERRIDE_TO=

# Optional: Cron-Ausdruck für den Reminder-Job (Default: täglich 07:00).
MAIL_CRON=0 7 * * *

# Optional: Basis-URL für Login-Links in den Mails (Default: http://localhost:3000).
APP_URL=https://thesisbuddy.hftm.ch
```

Test-UI: Admin-Dashboard → Kebab-Menü → „Mail-Einstellungen". Dort können die
SMTP-Verbindung geprüft, eine Testmail an eine beliebige Adresse gesendet und
der Reminder-Job manuell angestossen werden.

## Done since initial README

- Microsoft 365 authentication (M365 SSO via Entra ID)
- Document upload and management (Meilensteine + Vorlagen)
- Progress tracking with milestones (incl. FBL-Übersichtstabelle)
- Bilingual GUI (DE/FR), erweiterbar über `locales/<lang>/translation.json`
- Mail-Erinnerungen für Bewerter/Approver mit Cron-Scheduler, Per-Kind-Fälligkeiten,
  Prod-Override und Admin-Test-UI.

## Contributing

This is an academic project. Please follow standard coding practices and ensure all tests pass before submitting changes.

## License

ISC License - Academic Use
