const { sequelize, User, Department, Year, Thesis } = require('../src/models');

async function seedDatabase() {
  try {
    console.log('Starting database seeding...');

    await sequelize.sync({ force: true });
    console.log('Database synchronized (tables recreated).');

    const departments = await Department.bulkCreate([
      { name: 'Computer Science', department_lead_id: null },
      { name: 'Information Technology', department_lead_id: null },
      { name: 'Software Engineering', department_lead_id: null },
      { name: 'Data Science', department_lead_id: null },
    ]);
    console.log('Departments seeded.');

    const years = await Year.bulkCreate([
      { year: 2023 },
      { year: 2024 },
      { year: 2025 },
    ]);
    console.log('Years seeded.');

    const users = await User.bulkCreate([
      {
        username: 'student1',
        password: 'password123',
        name: 'Müller',
        firstname: 'Max',
        email: 'max.mueller@example.com',
        role: 'student'
      },
      {
        username: 'student2',
        password: 'password123',
        name: 'Schmidt',
        firstname: 'Anna',
        email: 'anna.schmidt@example.com',
        role: 'student'
      },
      {
        username: 'coach1',
        password: 'password123',
        name: 'Weber',
        firstname: 'Dr. Thomas',
        email: 'thomas.weber@university.com',
        role: 'coach'
      },
      {
        username: 'coach2',
        password: 'password123',
        name: 'Fischer',
        firstname: 'Prof. Sarah',
        email: 'sarah.fischer@university.com',
        role: 'coach'
      },
      {
        username: 'expert1',
        password: 'password123',
        name: 'Meyer',
        firstname: 'Dr. Michael',
        email: 'michael.meyer@industry.com',
        role: 'expert'
      },
      {
        username: 'expert2',
        password: 'password123',
        name: 'Wagner',
        firstname: 'Prof. Lisa',
        email: 'lisa.wagner@research.org',
        role: 'expert'
      },
      {
        username: 'admin',
        password: 'password123',
        name: 'Administrator',
        firstname: 'System',
        email: 'admin@university.com',
        role: 'admin'
      },
      {
        username: 'dept_lead1',
        password: 'password123',
        name: 'Johnson',
        firstname: 'Dr. Mark',
        email: 'mark.johnson@university.com',
        role: 'department_lead'
      },
      {
        username: 'dept_lead2',
        password: 'password123',
        name: 'Williams',
        firstname: 'Prof. Jennifer',
        email: 'jennifer.williams@university.com',
        role: 'department_lead'
      }
    ], {
      individualHooks: true
    });
    console.log('Users seeded.');

    // Update departments with department leads
    await departments[0].update({ department_lead_id: users[7].id }); // Computer Science - Dr. Mark Johnson
    await departments[1].update({ department_lead_id: users[8].id }); // Information Technology - Prof. Jennifer Williams
    console.log('Department leads assigned.');

    const theses = await Thesis.bulkCreate([
      {
        title: 'Machine Learning Applications in Healthcare Data Analysis',
        sponsor: 'HealthTech Solutions GmbH',
        year_id: years[1].id,
        department_id: departments[3].id
      },
      {
        title: 'Web Application Security: Modern Authentication Methods',
        sponsor: null,
        year_id: years[1].id,
        department_id: departments[0].id
      },
      {
        title: 'Cloud-Native Microservices Architecture for E-Commerce',
        sponsor: 'Digital Commerce Inc.',
        year_id: years[1].id,
        department_id: departments[2].id
      }
    ]);
    console.log('Theses seeded.');

    await theses[0].addStudents([users[0], users[1]]);
    await theses[0].addCoaches([users[2]]);
    await theses[0].addExperts([users[4]]);

    await theses[1].addStudents([users[0]]);
    await theses[1].addCoaches([users[3]]);
    await theses[1].addExperts([users[5]]);

    await theses[2].addStudents([users[1]]);
    await theses[2].addCoaches([users[2]]);
    await theses[2].addExperts([users[4]]);

    console.log('Thesis relationships created.');

    console.log('\n=== Sample Accounts ===');
    console.log('Students:');
    console.log('  Username: student1, Password: password123 (Max Müller)');
    console.log('  Username: student2, Password: password123 (Anna Schmidt)');
    console.log('\nCoaches:');
    console.log('  Username: coach1, Password: password123 (Dr. Thomas Weber)');
    console.log('  Username: coach2, Password: password123 (Prof. Sarah Fischer)');
    console.log('\nExperts:');
    console.log('  Username: expert1, Password: password123 (Dr. Michael Meyer)');
    console.log('  Username: expert2, Password: password123 (Prof. Lisa Wagner)');
    console.log('\nAdministrator:');
    console.log('  Username: admin, Password: password123 (System Administrator)');
    console.log('\nDepartment Leads:');
    console.log('  Username: dept_lead1, Password: password123 (Dr. Mark Johnson)');
    console.log('  Username: dept_lead2, Password: password123 (Prof. Jennifer Williams)');
    console.log('\nAll accounts can login with year: 2024');
    console.log('\nDatabase seeding completed successfully!');

  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seedDatabase();