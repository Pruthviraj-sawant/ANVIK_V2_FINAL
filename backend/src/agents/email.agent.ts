// import { User } from "../models/User.js"
// import prisma from 
import prisma from "../db/prismaClient.js";

import dotenv from 'dotenv';
import { google } from 'googleapis'; // You'll need googleapis

dotenv.config();
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // e.g., "http://localhost:3000/api/auth/google/callback"
);
export const getEmails = async (args: any, userId: any) => {
  try {
    // --- 1. Input Defaults ---
    const limit = args.limit || 10; // Default to 10 emails
    const category = args.category || 'INBOX'; // INBOX, SENT, DRAFT, STARRED, ARCHIVED, ALL
    const customFilter = args.filter || ''; // e.g., "from:boss@company.com"

    // --- 2. Authenticate ---
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.refreshToken) {
      return { error: "User has not linked their Google account." };
    }
    oauth2Client.setCredentials({ refresh_token: user.refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // --- 3. Build the Query String ('q') ---
    let queryParts = [];

    // Folder mapping
    switch (category.toUpperCase()) {
      case 'SENT': queryParts.push('in:sent'); break;
      case 'DRAFT': queryParts.push('in:draft'); break;
      case 'STARRED': queryParts.push('is:starred'); break;
      case 'ARCHIVED': queryParts.push('-in:inbox -in:sent -in:draft -in:trash'); break; // Archive isn't a label, it's the absence of Inbox
      case 'TRASH': queryParts.push('in:trash'); break;
      case 'SPAM': queryParts.push('in:spam'); break;
      case 'ALL': break; // No filter
      default: queryParts.push('in:inbox'); // Default to Inbox
    }

    // Add custom filters (like "from:email")
    if (customFilter) {
      queryParts.push(customFilter);
    }

    const queryString = queryParts.join(' ');

    // --- 4. List Message IDs ---
    // This call is fast but only returns IDs (no subjects/content)
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: queryString,
      maxResults: limit,
    });

    const messages = listResponse.data.messages || [];

    if (messages.length === 0) {
      return {
        status: "success",
        count: 0,
        data: [],
        message: "No emails found matching criteria."
      };
    }

    // --- 5. Fetch Metadata (Batch Optimization) ---
    // We need to fetch details for each ID to get the Subject/From.
    // We use format: 'metadata' to avoid downloading the body text (huge optimization).
    const emailPromises = messages.map(msg => {
      if (!gmail.users.messages) {
        throw new Error('Gmail messages API is not available');
      }
      if (!msg.id) {
        throw new Error('Message ID is missing');
      }
      return gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date']
      });
    });

    const emailDetails = await Promise.all(emailPromises);

    // --- 6. Format Output ---
    const formattedEmails = emailDetails.map(res => {
      if (!res?.data?.payload?.headers) {
        return {
          id: res.data.id || '',
          threadId: res.data.threadId || '',
          subject: '(No Subject)',
          from: 'Unknown',
          date: '',
          snippet: res.data.snippet || ''
        };
      }
      const headers = res.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const date = headers.find(h => h.name === 'Date')?.value || '';


      return {
        id: res.data.id,
        threadId: res.data.threadId,
        subject: subject,
        from: from,
        date: date,
        snippet: res.data.snippet
      };
    });

    return {
      status: "success",
      category: category,
      count: formattedEmails.length,
      data: formattedEmails
    };

  } catch (error: any) {
    console.error('Error fetching emails:', error.message);
    if (error.response?.data?.error === 'invalid_grant') {
      return { error: "Permission denied. Please re-link your Google account." };
    }
    return { error: 'Failed to fetch emails.' };
  }
};


export const getEmailDetails = async (args: any, userId: any) => {
  try {
    const messageId = args.messageId;
    if (!messageId) return { error: "Message ID is required." };

    // --- 1. Authenticate ---
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.refreshToken) {
      return { error: "User has not linked their Google account." };
    }

    // Set credentials
    oauth2Client.setCredentials({ refresh_token: user.refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // --- 2. Fetch Full Email ---
    // format: 'full' ensures we get the payload body and parts
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const payload = response.data.payload;
    if (!payload) throw new Error("payload not defined email.agent")
    const headers = payload.headers || [];

    // --- 3. Helper to Decode Body ---
    // Recursively finds the text/html or text/plain part and decodes it.
    // interface EmailPart {
    //   mimeType?: string;
    //   body?: { data?: string };
    //   parts?: EmailPart[];
    // }

    const getBody = (payload: any): string => {
      // Case A: Body is directly in the payload (simple emails)
      if (payload.body && payload.body.data) {
        return Buffer.from(payload.body.data, 'base64').toString('utf-8');
      }

      // Case B: Multipart emails (nested parts)
      if (payload.parts) {
        // Priority 1: HTML
        let part = payload.parts.find((p: any) => p.mimeType === 'text/html');

        // Priority 2: Plain Text (fallback)
        if (!part) part = payload.parts.find((p: any) => p.mimeType === 'text/plain');

        if (part && part.body && part.body.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }

        // Recursive Step: Dig deeper if the part itself is multipart
        for (let subPart of payload.parts) {
          if (subPart.parts) {
            const result = getBody(subPart);
            if (result) return result;
          }
        }
      }
      return "(No readable content found)";
    };

    const emailBody = getBody(payload);

    // --- 4. Return Clean Data ---
    return {
      status: "success",
      data: {
        id: response.data.id,
        threadId: response.data.threadId,
        subject: headers?.find(h => h.name === 'Subject')?.value || '(No Subject)',
        from: headers?.find(h => h.name === 'From')?.value || 'Unknown',
        to: headers?.find(h => h.name === 'To')?.value || 'Unknown',
        date: headers?.find(h => h.name === 'Date')?.value || '',
        snippet: response.data.snippet,
        body: emailBody // The full decoded HTML or Text content
      }
    };

  } catch (error: any) {
    console.error('Error fetching email details:', error.message);

    if (error.response?.data?.error === 'invalid_grant') {
      return { error: "Permission denied. Please re-link your Google account." };
    }
    if (error.code === 404) {
      return { error: "Email not found. It may have been deleted." };
    }

    return { error: 'Failed to read email content.' };
  }
};


const fetchImageAsBase64 = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';
    return {
      content: buffer.toString('base64'),
      contentType,
      filename: url.split('/').pop()?.split('?')[0] || 'image.png'
    };
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
};

export const sendEmail = async (args: any, userId: any) => {
  try {
    // --- 0. Input Defaults & Validation ---
    const to = args.to;
    const subject = args.subject || "(No Subject)";
    const body = args.body || ""; // HTML or Plain text
    const imageUrls = args.imageUrls || []; // Array of image URLs to attach
    const attachments = args.attachments || []; // Optional: [{filename, content, contentType}]

    if (!to) {
      return { error: "Recipient email ('to') is required." };
    }

    // --- 1. Authenticate ---
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.refreshToken) {
      return { error: "User has not linked their Google account." };
    }

    oauth2Client.setCredentials({ refresh_token: user.refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // --- 2. Process Image URLs ---
    const processedAttachments = [...attachments];
    for (const url of imageUrls) {
      const imgData = await fetchImageAsBase64(url);
      if (imgData) {
        processedAttachments.push(imgData);
      }
    }

    // --- 3. Construct the Raw Email (MIME) ---
    const boundary = "boundary_" + Date.now().toString(16);
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

    let message = "";
    message += `To: ${to}\r\n`;
    message += `Subject: ${utf8Subject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;

    if (processedAttachments.length > 0) {
      message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

      // HTML Body Part
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
      message += `${body}\r\n\r\n`;

      // Attachment Parts
      for (const attachment of processedAttachments) {
        message += `--${boundary}\r\n`;
        message += `Content-Type: ${attachment.contentType}; name="${attachment.filename}"\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n`;
        message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n`;
        message += `${attachment.content}\r\n\r\n`;
      }
      message += `--${boundary}--`;
    } else {
      message += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
      message += body;
    }

    // Encode the string to Base64URL
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // --- 4. Send the Email ---
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    // --- 5. Return Success ---
    return {
      status: "success",
      data: {
        id: response.data.id,
        threadId: response.data.threadId,
        labelIds: response.data.labelIds,
        message: "Email sent successfully." + (processedAttachments.length > 0 ? ` with ${processedAttachments.length} attachment(s).` : "")
      }
    };

  } catch (error: any) {
    console.error('Error sending email:', error.message);

    if (error.response?.data?.error === 'invalid_grant') {
      return { error: "Permission denied. Please re-link your Google account." };
    }

    return { error: 'Failed to send email.' };
  }
};