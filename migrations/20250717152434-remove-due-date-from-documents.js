'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.removeColumn('documents', 'due_date');
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.addColumn('documents', 'due_date', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Due date for document submission',
    });
  }
};
