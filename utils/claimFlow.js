const config = require('../config');
const {
  getPendingClaimsForDiscord,
  markClaimsAsClaimed,
} = require('./tebexPurchases');

function summarizeUniqueValues(records, field, limit = 6) {
  const unique = [...new Set(records.map((record) => record[field]).filter(Boolean))];

  if (unique.length <= limit) return unique.join(', ');
  return `${unique.slice(0, limit).join(', ')} +${unique.length - limit}`;
}

function buildPackageSummary(records, limit = 5) {
  const purchases = Array.isArray(records) ? records : [];

  const packages = new Map();

  for (const purchase of purchases) {
    const packageId = String(purchase?.package_id || '').trim();
    if (!packageId) continue;

    const current = packages.get(packageId) || {
      id: packageId,
      label: String(purchase?.package_name || '').trim() || `Pacote ${packageId}`,
      count: 0,
    };

    current.count += 1;
    packages.set(packageId, current);
  }

  const list = [...packages.values()]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.label.localeCompare(right.label, 'pt-BR');
    });

  const visible = list.slice(0, limit).map((item) => `${item.label} x${item.count}`);

  if (list.length <= limit) {
    return {
      list,
      text: visible.join(', '),
    };
  }

  return {
    list,
    text: `${visible.join(', ')} +${list.length - limit}`,
  };
}

async function getClaimSnapshotForDiscord(discordId) {
  const pending = await getPendingClaimsForDiscord(discordId);
  const packages = buildPackageSummary(pending);

  return {
    pending,
    pendingCount: pending.length,
    packages,
  };
}

async function processClaimForMember({ guild, userId, member }) {
  const packageRoleMap = config.tebex?.packageRoleMap || {};

  if (Object.keys(packageRoleMap).length === 0) {
    return {
      ok: false,
      code: 'missing_role_map',
      pending: [],
      pendingCount: 0,
      packages: buildPackageSummary([]),
      delivered: [],
      alreadyOwned: [],
      missingMapping: [],
      missingRole: [],
      failedDeliveries: [],
      markedAsClaimed: 0,
    };
  }

  const pending = await getPendingClaimsForDiscord(userId);
  const packages = buildPackageSummary(pending);

  if (pending.length === 0) {
    return {
      ok: true,
      code: 'no_pending',
      pending,
      pendingCount: 0,
      packages,
      delivered: [],
      alreadyOwned: [],
      missingMapping: [],
      missingRole: [],
      failedDeliveries: [],
      markedAsClaimed: 0,
    };
  }

  const resolvedMember = member
    || await guild.members.fetch(userId).catch(() => null);

  if (!resolvedMember) {
    return {
      ok: false,
      code: 'member_not_found',
      pending,
      pendingCount: pending.length,
      packages,
      delivered: [],
      alreadyOwned: [],
      missingMapping: [],
      missingRole: [],
      failedDeliveries: [],
      markedAsClaimed: 0,
    };
  }

  const toClaim = [];
  const delivered = [];
  const alreadyOwned = [];
  const missingMapping = [];
  const missingRole = [];
  const failedDeliveries = [];

  for (const purchase of pending) {
    const roleId = packageRoleMap[String(purchase.package_id)];

    if (!roleId) {
      missingMapping.push(purchase);
      continue;
    }

    const role = guild.roles.cache.get(roleId)
      || await guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
      missingRole.push({
        ...purchase,
        role_id: roleId,
      });
      continue;
    }

    if (resolvedMember.roles.cache.has(role.id)) {
      alreadyOwned.push(purchase);
      toClaim.push(purchase);
      continue;
    }

    try {
      await resolvedMember.roles.add(role, `Tebex claim ${purchase.payment_id}`);
      delivered.push(purchase);
      toClaim.push(purchase);
    } catch (error) {
      failedDeliveries.push({
        ...purchase,
        reason: error?.message || 'Unknown role assignment error.',
      });
    }
  }

  const markedAsClaimed = await markClaimsAsClaimed(toClaim, {
    claimedBy: userId,
    guildId: guild?.id || null,
  });

  return {
    ok: true,
    code: 'processed',
    pending,
    pendingCount: pending.length,
    packages,
    delivered,
    alreadyOwned,
    missingMapping,
    missingRole,
    failedDeliveries,
    markedAsClaimed,
  };
}

module.exports = {
  buildPackageSummary,
  getClaimSnapshotForDiscord,
  processClaimForMember,
  summarizeUniqueValues,
};
