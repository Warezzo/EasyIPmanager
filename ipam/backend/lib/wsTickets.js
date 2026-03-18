/**
 * One-time WebSocket authentication tickets.
 * Eliminates JWT exposure in URL query parameters / proxy logs.
 *
 * Flow: client calls POST /api/auth/ws-ticket → gets a short-lived ticket →
 *       connects to ws://host/ws/ssh?ticket=xxx → server validates & consumes ticket.
 */

const crypto = require("crypto");

const tickets = new Map(); // ticket → { userId, expiresAt }
const TICKET_TTL = 30_000; // 30 seconds

function createTicket(userId) {
  const ticket = crypto.randomBytes(32).toString("hex");
  tickets.set(ticket, { userId, expiresAt: Date.now() + TICKET_TTL });
  return ticket;
}

function validateTicket(ticket) {
  if (!ticket || typeof ticket !== "string") return null;
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket); // one-time use — consumed on validation
  if (Date.now() > entry.expiresAt) return null;
  return entry.userId;
}

// Cleanup expired tickets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (now > entry.expiresAt) tickets.delete(ticket);
  }
}, 5 * 60_000).unref();

module.exports = { createTicket, validateTicket };
