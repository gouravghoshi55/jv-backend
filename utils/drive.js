const { google } = require("googleapis");
const path = require("path");
const stream = require("stream");

let driveApi = null;

async function getDrive() {
  if (driveApi) return driveApi;

  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, "../credentials.json"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const client = await auth.getClient();
  driveApi = google.drive({ version: "v3", auth: client });
  return driveApi;
}

// Create a folder in Google Drive
async function createDriveFolder(folderName, parentFolderId) {
  const drive = await getDrive();

  // Check if folder already exists
  const existing = await drive.files.list({
    q: `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0]; // Return existing folder
  }

  // Create new folder
  const folder = await drive.files.create({
    resource: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id, name",
  });

  return folder.data;
}

// Upload file to Google Drive folder
async function uploadFileToDrive(fileName, fileBase64, mimeType, folderId) {
  const drive = await getDrive();

  // Convert base64 to buffer
  const buffer = Buffer.from(fileBase64, "base64");

  // Create readable stream from buffer
  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const file = await drive.files.create({
    resource: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType || "application/pdf",
      body: bufferStream,
    },
    fields: "id, name, webViewLink",
  });

  // Make file accessible via link
  await drive.permissions.create({
    fileId: file.data.id,
    resource: {
      role: "reader",
      type: "anyone",
    },
  });

  return file.data;
}

module.exports = {
  createDriveFolder,
  uploadFileToDrive,
};