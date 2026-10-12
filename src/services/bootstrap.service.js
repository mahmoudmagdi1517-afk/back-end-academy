const { User } = require("../models/User");
const { ROLES } = require("../constants");

async function ensureOwner() {
  const email = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) return;

  const existing = await User.findOne({ role: ROLES.OWNER });
  if (existing) {
    const needsEmailUpdate = existing.email !== email;
    const needsPasswordUpdate =
      !existing.passwordHash ||
      (await existing.comparePassword(password)) === false;

    if (needsEmailUpdate || needsPasswordUpdate) {
      existing.email = email;
      existing.passwordHash = await User.hashPassword(password);
      existing.name = process.env.OWNER_NAME || existing.name || "System Owner";
      existing.isActive = true;
      await existing.save();
      // eslint-disable-next-line no-console
      console.log(`Updated owner user ${existing.email}`);
    }

    return existing;
  }

  const passwordHash = await User.hashPassword(password);
  const owner = await User.create({
    email,
    passwordHash,
    name: process.env.OWNER_NAME || "System Owner",
    role: ROLES.OWNER,
  });
  // eslint-disable-next-line no-console
  console.log(`Bootstrapped owner user ${owner.email}`);
  return owner;
}

module.exports = { ensureOwner };
