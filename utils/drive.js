const { google } = require("googleapis");
const stream = require("stream");
const path = require("path");
require("dotenv").config();

let driveApi = null;

async function getDrive() {
  if (driveApi) return driveApi;

  let auth;
  if (process.env.GOOGLE_CREDENTIALS) {
    // Production (Render): use base64 encoded credentials from env var
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
      ],
    });
  } else {
    // Local development: use credentials.json file
    auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(__dirname, "../credentials.json"),
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
      ],
    });
  }

  const client = await auth.getClient();
  driveApi = google.drive({ version: "v3", auth: client });
  return driveApi;
}

async function createDriveFolder(folderName, parentFolderId) {
  const drive = await getDrive();

  const fileMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentFolderId],
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  return response.data;
}

async function uploadFileToDrive(fileName, fileBase64, mimeType, folderId) {
  const drive = await getDrive();

  const bufferStream = new stream.PassThrough();
  bufferStream.end(Buffer.from(fileBase64, "base64"));

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: mimeType,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType,
      body: bufferStream,
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  return response.data;
}

async function listFilesInFolder(folderId) {
  const drive = await getDrive();

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, webViewLink)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return response.data.files || [];
}

module.exports = {
  createDriveFolder,
  uploadFileToDrive,
  listFilesInFolder,
};