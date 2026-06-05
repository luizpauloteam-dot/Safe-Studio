const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const appConfig = require('../config');

const DEFAULT_WELCOME_CHANNEL_ID = '1461496254742794293';
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || DEFAULT_WELCOME_CHANNEL_ID;
const DEFAULT_WELCOME_ROLE_ID = '1461496253245423841';
const WELCOME_ROLE_ID = process.env.WELCOME_ROLE_ID || DEFAULT_WELCOME_ROLE_ID;
const DEFAULT_WELCOME_BANNER_URL = 'https://cdn.discordapp.com/attachments/1473339280633102623/1479657215697748199/welcome_discord.gif?ex=69b6102a&is=69b4beaa&hm=57c459fa250d073ebaaa6aa389081017c603c042d50566a167eec1becdbdfc05&';
const WELCOME_BANNER_URL = process.env.WELCOME_BANNER_URL || DEFAULT_WELCOME_BANNER_URL;

function parseAccentColor() {
  const color = String(appConfig.discord?.color || '00FF7F').replace('#', '');
  const parsed = Number.parseInt(color, 16);
  return Number.isNaN(parsed) ? 0x00ff7f : parsed;
}

function buildWelcomeMessage(member) {
  const hasBanner = Boolean(WELCOME_BANNER_URL);
  const avatarUrl = member.displayAvatarURL({ extension: 'png', size: 256 });

  const heroSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# Welcome to ${member.guild.name}`,
        `<@${member.id}>, your access has been successfully approved.`,
        'This is our official RedM store and support hub.',
      ].join('\n')),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`Avatar of ${member.user.tag}`),
    );

  const container = new ContainerBuilder()
    .setAccentColor(0x000000);

  container
    .addSectionComponents(
      heroSection,
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Store Information**',
        'Our team delivers premium RedM assets, updates, and direct support through this server.',
      ].join('\n')),
      new TextDisplayBuilder().setContent([
        '**How To Proceed**',
        '1. Review the rules and announcement channels.',
        '2. Explore available products and release updates.',
        '3. Open a ticket whenever you need purchase or technical support.',
      ].join('\n')),
    );

  if (hasBanner) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(WELCOME_BANNER_URL)
            .setDescription('Safe Studio RedM Store banner'),
        ),
      );
  }

  const payload = {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: {
      parse: [],
      users: [member.id],
    },
  };

  return payload;
}

module.exports = {
  WELCOME_CHANNEL_ID,
  WELCOME_ROLE_ID,
  buildWelcomeMessage,
};
