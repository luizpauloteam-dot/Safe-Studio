const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');

const CLAIM_BANNER_PATH = path.join(__dirname, '..', 'assets', 'safe-claim-banner.png');
const CLAIM_BANNER_NAME = 'safe-claim-banner.png';
const CLAIM_COLOR = 0x000000;
const CLAIM_WARNING_COLOR = 0xd2b46d;
const CLAIM_ERROR_COLOR = 0xc85f5f;
const CLAIM_IDLE_COLOR = 0xbdb7aa;

function resolveFlags(ephemeral) {
  return ephemeral
    ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    : MessageFlags.IsComponentsV2;
}

function resolveBannerFiles() {
  if (!fs.existsSync(CLAIM_BANNER_PATH)) return [];

  return [{
    attachment: CLAIM_BANNER_PATH,
    name: CLAIM_BANNER_NAME,
  }];
}

function buildClaimButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim:panel:redeem')
      .setLabel('Claim now')
      .setStyle(ButtonStyle.Secondary),
  );
}

function addBanner(container) {
  if (!fs.existsSync(CLAIM_BANNER_PATH)) return container;

  return container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL(`attachment://${CLAIM_BANNER_NAME}`)
        .setDescription('Safe Studio claim panel banner'),
    ),
  );
}

function createBaseContainer(title, subtitle, color, options = {}) {
  const botAvatarUrl = String(options.botAvatarUrl || '').trim();
  const container = new ContainerBuilder()
    .setAccentColor(color);

  if (botAvatarUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            `# ${title}`,
            subtitle,
          ].join('\n')),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(botAvatarUrl)
            .setDescription('Safe Studio bot icon'),
        ),
    );
    return container;
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      `# ${title}`,
      subtitle,
    ].join('\n')),
  );

  return container;
}

function addBodyBlock(container, content) {
  return container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    );
}

function buildAvailabilityText(stats) {
  if (!stats) {
    return 'If your purchase is very recent, please wait a few moments before trying to claim it.';
  }

  if (stats.pendingClaims > 0 || stats.claimed > 0 || stats.total > 0) {
    return 'Automatic claiming is active. If your purchase was just confirmed, it may take a few moments to appear here.';
  }

  return 'The panel is ready for new claims as soon as your purchase is registered.';
}

function buildPackageText(packages, fallbackText) {
  if (!packages?.list?.length) return fallbackText;
  return packages.text || fallbackText;
}

function buildResultDescription(result) {
  if (result.code === 'processed') {
    if (result.markedAsClaimed > 0) {
      return 'Your claim has been processed and eligible roles have already been handled in this server.';
    }

    return 'Your purchase was found, but no new role was delivered right now. See the details below.';
  }

  if (result.code === 'no_pending') {
    return 'We could not find any pending purchases linked to your Discord account.';
  }

  if (result.code === 'missing_role_map') {
    return 'The claim system has not been fully configured yet.';
  }

  if (result.code === 'member_not_found') {
    return 'I could not identify your account in this server to apply the roles.';
  }

  return 'Your claim was checked, but it returned an unexpected status.';
}

function buildResultColor(result) {
  if (result.code === 'processed' && result.markedAsClaimed > 0) return CLAIM_COLOR;
  if (result.code === 'no_pending') return CLAIM_IDLE_COLOR;
  if (result.code === 'processed') return CLAIM_WARNING_COLOR;
  return CLAIM_ERROR_COLOR;
}

function buildIssuesText(result) {
  if (result.code === 'no_pending') {
    return 'No pending purchase was found for your Discord account.';
  }

  if (result.code === 'missing_role_map' || result.code === 'member_not_found') {
    return 'There was a system issue. Please try again in a moment or contact the staff team.';
  }

  const lines = [];

  if ((result.delivered?.length || 0) > 0) {
    lines.push('The available roles for delivery have already been processed.');
  }

  if (result.alreadyOwned?.length > 0) {
    lines.push('Some of the roles were already on your account.');
  }

  if ((result.missingMapping?.length || 0) > 0 || (result.missingRole?.length || 0) > 0) {
    lines.push('Some items need staff review before the claim can be fully completed.');
  }

  if (result.failedDeliveries?.length > 0) {
    lines.push('There were issues applying some roles. If something is missing, please open a ticket.');
  }

  if (lines.length === 0 && result.code === 'processed' && result.markedAsClaimed === 0) {
    return 'No new role needed to be delivered right now.';
  }

  if (lines.length === 0) {
    return 'Everything looks good with your claim.';
  }

  return lines.join('\n');
}

function buildMessagePayload(container, options = {}) {
  const ephemeral = options.ephemeral === true;
  const includeBanner = options.includeBanner === true;

  if (includeBanner) {
    addBanner(container);
  }

  container.addActionRowComponents(buildClaimButtons());

  return {
    flags: resolveFlags(ephemeral),
    components: [container],
    files: includeBanner ? resolveBannerFiles() : [],
    allowedMentions: {
      parse: [],
    },
  };
}

async function buildClaimLandingMessage(stats = null, options = {}) {
  const container = createBaseContainer(
    'SAFE STUDIO | Claim',
    'Claim your Tebex roles directly in Discord, without tickets and without waiting for manual support.',
    CLAIM_COLOR,
    options,
  );

  addBodyBlock(container, [
    '**Before claiming**',
    '1. Purchase normally on Tebex.',
    '2. Enter your Discord ID during checkout.',
    '3. Click `Claim now`.',
  ].join('\n'));

  addBodyBlock(container, [
    '**Important**',
    'Use the same Discord ID that was entered during the purchase.',
    buildAvailabilityText(stats),
  ].join('\n'));

  addBodyBlock(container, [
    '**If something does not arrive**',
    'If your purchase was approved and the role still does not arrive after a few tries, open a [ticket](https://discord.com/channels/1461496253245423838/1461496255715868793) with your purchase proof.',
  ].join('\n'));

  return buildMessagePayload(container, options);
}

async function buildClaimStatusMessage(snapshot, options = {}) {
  const hasPending = snapshot.pendingCount > 0;
  const container = createBaseContainer(
    'SAFE STUDIO | Your Pending Claims',
    hasPending
      ? 'We found purchases that are ready to be claimed on your account.'
      : 'There are no pending purchases for your Discord account right now.',
    hasPending ? CLAIM_COLOR : CLAIM_IDLE_COLOR,
    options,
  );

  addBodyBlock(container, [
    '**Your summary**',
    `Pending purchases: ${snapshot.pendingCount}`,
    `Detected packages: ${buildPackageText(snapshot.packages, 'No pending package found.')}`,
  ].join('\n'));

  addBodyBlock(container, [
    '**What to do now**',
    hasPending
      ? 'Click `Claim now` to deliver the configured roles in this server.'
      : 'If you just purchased, wait for the purchase to be registered and try again in a few moments.',
  ].join('\n'));

  return buildMessagePayload(container, options);
}

async function buildClaimResultMessage(result, options = {}) {
  const container = createBaseContainer(
    'SAFE STUDIO | Claim Result',
    buildResultDescription(result),
    buildResultColor(result),
    options,
  );

  addBodyBlock(container, [
    '**Processing summary**',
    `Purchases found: ${result.pendingCount}`,
    `Claims confirmed: ${result.markedAsClaimed}`,
    `Roles delivered now: ${result.delivered?.length || 0}`,
    `Detected packages: ${buildPackageText(result.packages, 'No package found.')}`,
  ].join('\n'));

  addBodyBlock(container, [
    '**Guidance**',
    buildIssuesText(result),
  ].join('\n'));

  return buildMessagePayload(container, options);
}

async function buildClaimErrorMessage(message, options = {}) {
  const container = createBaseContainer(
    'SAFE STUDIO | Claim Unavailable',
    message || 'It was not possible to check your claim right now. Please try again in a few moments.',
    CLAIM_ERROR_COLOR,
    options,
  );

  addBodyBlock(container, [
    '**What to do**',
    'Wait a few moments and try again.',
    'If the problem continues, please open a ticket so the staff team can check it.',
  ].join('\n'));

  return buildMessagePayload(container, options);
}

module.exports = {
  buildClaimErrorMessage,
  buildClaimLandingMessage,
  buildClaimResultMessage,
  buildClaimStatusMessage,
};
