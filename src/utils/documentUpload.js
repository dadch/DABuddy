const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Document, DocumentLog, Thesis, User } = require('../models');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

// State-based document requirements
const DOCUMENT_REQUIREMENTS = {
  'Initial': {
    required: ['Project Scribble'],
    allowed: ['Project Scribble'],
    uploader: 'student'
  },
  'Scribble': {
    required: ['Project Order'],
    allowed: ['Project Order'],
    uploader: 'student'
  },
  'Project assignment': {
    required: ['Requirements Specification'],
    allowed: ['Requirements Specification'],
    uploader: 'student'
  },
  'Requirements done': {
    required: ['Thesis Assignment'],
    allowed: ['Thesis Assignment'],
    uploader: 'coach'
  },
  'Assignment done': {
    required: [],
    allowed: [
      'Minutes',
      'Worktime Report',
      'Thesis Document',
      'Abstract',
      'Monetary Benefit Description'
    ],
    uploader: 'any'
  }
};

// Validate if document type is allowed for current thesis state
const isDocumentAllowed = (thesisState, documentType) => {
  const stateRequirements = DOCUMENT_REQUIREMENTS[thesisState];
  return stateRequirements && stateRequirements.allowed.includes(documentType);
};

// Validate if user can upload document type for current thesis state
const canUserUploadDocument = (thesisState, documentType, userRole) => {
  const stateRequirements = DOCUMENT_REQUIREMENTS[thesisState];
  if (!stateRequirements) return false;
  
  const uploaderRequirement = stateRequirements.uploader;
  
  if (uploaderRequirement === 'any') return true;
  if (uploaderRequirement === 'student' && userRole === 'student') return true;
  if (uploaderRequirement === 'coach' && userRole === 'coach') return true;
  
  return false;
};

// Get required documents for a thesis state
const getRequiredDocuments = (thesisState) => {
  const stateRequirements = DOCUMENT_REQUIREMENTS[thesisState];
  return stateRequirements ? stateRequirements.required : [];
};

// Get allowed documents for a thesis state
const getAllowedDocuments = (thesisState) => {
  const stateRequirements = DOCUMENT_REQUIREMENTS[thesisState];
  return stateRequirements ? stateRequirements.allowed : [];
};

// Log document upload
const logDocumentUpload = async (userId, thesisId, documentName, documentType, action = 'upload', fileSize = null, ipAddress = null) => {
  try {
    await DocumentLog.create({
      user_id: userId,
      thesis_id: thesisId,
      document_name: documentName,
      document_type: documentType,
      action: action,
      file_size: fileSize,
      ip_address: ipAddress,
      upload_timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to log document upload:', error);
  }
};

// Check if required documents are uploaded for state transition
const areRequiredDocumentsUploaded = async (thesisId, targetState) => {
  const requiredDocs = getRequiredDocuments(targetState);
  if (requiredDocs.length === 0) return true;
  
  const uploadedDocs = await Document.findAll({
    where: { thesis_id: thesisId },
    attributes: ['document_type']
  });
  
  const uploadedTypes = uploadedDocs.map(doc => doc.document_type);
  
  return requiredDocs.every(requiredDoc => uploadedTypes.includes(requiredDoc));
};

module.exports = {
  upload,
  DOCUMENT_REQUIREMENTS,
  isDocumentAllowed,
  canUserUploadDocument,
  getRequiredDocuments,
  getAllowedDocuments,
  logDocumentUpload,
  areRequiredDocumentsUploaded
};