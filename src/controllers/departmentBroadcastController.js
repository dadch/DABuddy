// API für "Alle benachrichtigen" und das Nachrichten-Log der Fachbereichsleitung.
const mailer = require('../config/mailer');
const { resolveRecipients, sendBroadcast, sendDirectMessage, listBroadcasts } = require('../utils/departmentBroadcast');


// GET /api/department-lead/broadcast/recipients?department=<id>
const previewBroadcastRecipients = async (req, res) => {
  try {
    const { departments, mode, recipients } = await resolveRecipients({
      leadUserId: req.session.userId,
      yearId: req.session.selectedYear,
      departmentFilter: req.query.department,
    });
    res.json({
      success: true,
      mailConfigured: mailer.isConfigured(),
      mode,
      departments: departments.map(d => d.name),
      recipients: recipients.map(({ user, roles }) => ({
        name: `${user.firstname} ${user.name}`.trim(),
        email: user.email,
        roles: ['coach', 'expert'].filter(r => roles.has(r)),
      })),
    });
  } catch (error) {
    console.error('previewBroadcastRecipients error:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// POST /api/department-lead/broadcast  { subject, message, department }
const sendDepartmentBroadcast = async (req, res) => {
  try {
    if (!mailer.isConfigured()) {
      return res.status(400).json({ success: false, message: 'Der Mailversand ist nicht konfiguriert.' });
    }
    const { subject, message, department } = req.body || {};
    const result = await sendBroadcast({
      leadUserId: req.session.userId,
      yearId: req.session.selectedYear,
      departmentFilter: department,
      subject,
      body: message,
    });
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    res.json({ success: true, broadcastId: result.broadcastId, mode: result.mode, sent: result.sent, failed: result.failed });
  } catch (error) {
    console.error('sendDepartmentBroadcast error:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// POST /api/department-lead/message  { thesis_id, user_id, subject, message }
const sendDepartmentMessage = async (req, res) => {
  try {
    if (!mailer.isConfigured()) {
      return res.status(400).json({ success: false, message: 'Der Mailversand ist nicht konfiguriert.' });
    }
    const { thesis_id, user_id, subject, message } = req.body || {};
    const result = await sendDirectMessage({
      leadUserId: req.session.userId,
      thesisId: thesis_id,
      recipientUserId: user_id,
      subject,
      body: message,
    });
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    if (result.failed) {
      return res.status(502).json({ success: false, message: `Versand fehlgeschlagen: ${result.error}` });
    }
    res.json({ success: true, broadcastId: result.broadcastId });
  } catch (error) {
    console.error('sendDepartmentMessage error:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// GET /api/department-lead/broadcasts
const getDepartmentBroadcasts = async (req, res) => {
  try {
    const items = await listBroadcasts({ userId: req.session.userId, userRole: req.session.userRole });
    res.json({ success: true, items });
  } catch (error) {
    console.error('getDepartmentBroadcasts error:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

module.exports = { previewBroadcastRecipients, sendDepartmentBroadcast, sendDepartmentMessage, getDepartmentBroadcasts };
