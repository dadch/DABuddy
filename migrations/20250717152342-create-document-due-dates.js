'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('document_due_dates', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      document_type: {
        type: Sequelize.ENUM(
          'Project Scribble',
          'Project Order',
          'Requirements Specification',
          'Thesis Assignment',
          'Minutes',
          'Worktime Report',
          'Thesis Document',
          'Abstract',
          'Monetary Benefit Description'
        ),
        allowNull: false,
      },
      year_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'years',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      due_date: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Due date for this document type in this academic year',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });

    // Create unique index for document_type and year_id combination
    await queryInterface.addIndex('document_due_dates', {
      unique: true,
      fields: ['document_type', 'year_id'],
      name: 'document_due_dates_type_year_unique',
    });

    // Create index for year_id
    await queryInterface.addIndex('document_due_dates', {
      fields: ['year_id'],
      name: 'document_due_dates_year_id_idx',
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('document_due_dates');
  }
};
