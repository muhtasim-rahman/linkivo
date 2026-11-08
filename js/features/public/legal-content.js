/**
 * Linkivo — js/features/public/legal-content.js  (v2.5.4)
 * Purpose: the text of the Privacy page and the Terms page, as data, so the static pages (made by "@ Creator/tools/gen-seo.mjs") and the tests share ONE source.
 *          Written from what the code, the Worker and the database rules really do (RULES.md section 3, ARCHITECTURE.md, worker.js, engine/schema.js). Nothing here is a guess:
 *          a thing that could not be checked is not said. When a feature changes, change the sentence here in the same release (a test lists the third-party hosts the app really calls).
 * API: LEGAL_UPDATED  CONTACT  PRIVACY -> { title, lead, summary: [..], sections }   TERMS -> { title, lead, summary, sections }
 *      section = { id, h, p?: [text], items?: [text], table?: { head: [..], rows: [[..]] } }
 */
export const LEGAL_UPDATED = '8 November 2026';
export const CONTACT = 'linkivo.web@gmail.com';

export const PRIVACY = {
  title: 'Privacy',
  lead: 'What Linkivo stores, where it goes, who can see it, how long it stays and how you take it back. Written from how the app actually works.',
  summary: [
    'Your links are yours. They are stored in your own account, or only on your own device if you use Linkivo as a guest.',
    'Linkivo has no ads, no analytics and no tracking cookies. Nothing is sold or shared for marketing.',
    'Your app PIN and your locked-folder code are never stored as text. They are checked on a server, and the database refuses to open your data without a valid session.',
    'To show titles, pictures and previews, Linkivo asks other services about the address of a link. The list is below, service by service.',
    'You can export everything, delete things, and delete your whole account at any time.'
  ],
  sections: [
    { id: 'who', h: 'Who runs Linkivo', p: [
      'Linkivo is made and run by Muhtasim Rahman (Turzo), a student developer in Bangladesh. It is a free project; there is no company behind it and nothing is sold.',
      `For any privacy question or request, write to ${CONTACT}.`] },

    { id: 'modes', h: 'Guest and account: two ways to use Linkivo', table: {
      head: ['', 'Guest', 'Account'],
      rows: [
        ['Where your library lives', 'Only in this browser, on this device (IndexedDB and local storage).', 'In your account in Google Firebase (Realtime Database), with a copy cached on each device you use.'],
        ['Sign-in', 'None. No email, no name.', 'Google sign-in or email and password, handled by Firebase Authentication.'],
        ['If the browser data is cleared', 'Everything is gone and nobody can bring it back. Make a backup now and then.', 'Your library is still in your account and comes back when you sign in.'],
        ['Other devices', 'Not possible, until you sign in and move the guest data into an account.', 'Every device shows the same library.']] },
      p: ['A guest can sign in later and move everything into the account; the guest copy on the device is then removed.'] },

    { id: 'collected', h: 'What Linkivo stores', p: ['This is the complete list of what exists, by the part of the app that creates it.'], table: {
      head: ['What', 'Details', 'Where'],
      rows: [
        ['Sign-in details', 'Email address, display name, sign-in method, account ID and the picture address from Google when you use Google sign-in.', 'Firebase Authentication (accounts only).'],
        ['Folders and links', 'Folder names, colours and icons; each link\'s address, title, tags, favourite, read-later and block flags, points and dates.', 'Your account (and cached on your devices). Guests: this device only.'],
        ['Page details', 'The description, the address of the thumbnail picture, of a screenshot and of a video that were found for a link, and which service found them. Only addresses are kept, never the pictures or videos themselves.', 'Your account (a copy is cached on the device).'],
        ['Settings', 'Your choices such as theme, accent colour, search and history options.', 'This device; for an account also in your account so every device follows.'],
        ['Profile', 'Name, headline, bio, country, city, birthday, languages, interests, website, pronouns and the colours you picked, only the fields you fill in. A profile photo, if you upload one.', 'Your account. The photo is stored by imgbb (see the services list).'],
        ['History', 'Links you opened (address, title, site, folder, how you opened it, time). You choose how long it is kept (off, 1 hour, 1, 3, 7, 14 or 30 days) and whether it stays on this device (the default) or in your account.', 'This device or your account, as you choose.'],
        ['Activity log', 'A short record of notable actions such as imports, exports and deletes, and of security events such as a PIN change.', 'On this device; security events are also kept in your account.'],
        ['Recent imports', 'A small record per finished import, restore or title fetch (type, counts, time).', 'Your account (up to the newest 50), and this device.'],
        ['Signed-in devices', 'For each device: its name, browser, operating system, kind, first and last time seen, and the approximate place (city, region, country) and network address (IP) that the server saw.', 'Your account. Only you can see this list.'],
        ['Lock information', 'Whether the app lock and the locked folders are switched on, the chosen code symbol, and the auto-lock time. Never the PIN or the code.', 'Your account; a copy on the device.'],
        ['Background jobs', 'Jobs that continue on the server when the app is closed (for example fetching titles): the list of link IDs, progress, status and time.', 'Your account; finished jobs are removed automatically two days later.'],
        ['Deleted-account record', 'If you delete your account: your account ID and email address, the deletion time, the day it will be removed for good, and a small summary of what the account held (shown to you before you confirm).', 'Firebase, until the account is purged.']] } },

    { id: 'pin', h: 'PIN, locked folders and what protects your data', items: [
      'Your data is protected by the database rules on the server, not only by the screen. A request that does not belong to your account is refused.',
      'The app PIN and the locked-folder code are sent over HTTPS to a Cloudflare Worker that Linkivo runs. They are checked there and kept only as a hash made with a secret value (a pepper) that is not in the app or in this repository. Linkivo cannot read them back.',
      'Wrong guesses are counted on the server, and the wait between tries grows. This stops guessing even if someone has your device.',
      'With the app lock on, the database only opens for your account after the PIN was verified (a short server session). While the app is locked, the library is removed from the screen and from memory.',
      'The library copy that is kept on a device is encrypted with a key made from your PIN while the app lock is on. The key stays in memory only. A short PIN (4 digits) is weaker against someone who copies the stored data and guesses offline; six or more digits are much better. For extra safety, also use your device\'s own app lock.',
      'Locked folders live under their own path in the database that needs a separate server session. While they are locked they are not in memory, in the stored copy on the device, in search, in exports or in the history list. Opening a link from a locked folder is listed in History only while the folders stay unlocked, in memory, and is gone when they lock again.',
      'A guest\'s PIN is checked on the device only, so a guest who forgets it has to erase the device data.',
      'Honest limit: Linkivo protects you against other people and other apps, not against the person who operates the database. The project owner has technical access to the project in the Firebase console, as any project owner has. Linkivo has no screen where one person can read another person\'s links.'] },

    { id: 'services', h: 'Other services Linkivo talks to', p: [
      'Linkivo has no server of its own besides one Cloudflare Worker. To show information about a link it uses the services below. A service receives only what is listed in the last column, and it can see the network address of whoever makes the request.'],
      table: {
        head: ['Service', 'Used for', 'What it receives'],
        rows: [
          ['Google Firebase (Authentication and Realtime Database), Google Hosting', 'Sign-in, storing an account\'s data, serving the app.', 'Everything in the "account" column above that is stored in your account.'],
          ['Cloudflare Workers (the Linkivo Worker)', 'Fetching page details, checking links, PIN and locked-folder sessions, account deletion, background jobs, profile photo upload.', 'The link address you ask about, your PIN or code when you enter it, and your sign-in token. Cloudflare also sees the request as any host does.'],
          ['The pages you save (the sites themselves)', 'The Worker opens a link\'s page to read its title, description and pictures; the dead-link check does the same.', 'A normal page request from the Worker, not from your device.'],
          ['Jina Reader, Dub, JSONLink, Microlink, AllOrigins, the Internet Archive (Wayback Machine)', 'Fallbacks when a page cannot be read directly. Microlink can also be asked by the app itself for a preview.', 'The address of the link. Nothing else about you.'],
          ['oEmbed providers such as YouTube, Vimeo, Spotify, SoundCloud, TikTok, Reddit and X', 'Titles and thumbnails of videos, music and posts.', 'The address of the link, through the Worker.'],
          ['WordPress mShots and thum.io', 'Screenshots of a page shown as a picture in lists and in the preview.', 'The address of the page, requested from your browser, so they see your network address. You can switch pictures off in Settings.'],
          ['Google favicon service', 'The small site icon next to a link.', 'The site\'s domain name, from your browser.'],
          ['imgbb', 'Hosting the profile photo that you choose to upload.', 'The photo, sent through the Worker. Uploading is optional.'],
          ['Google Fonts and flagcdn.com', 'Fonts and small country flags.', 'A normal file request from your browser.'],
          ['YouTube (privacy-enhanced mode)', 'The introduction video, only after you press play, and videos inside a preview.', 'Loaded only when you press play. YouTube then handles that request under its own policy.']] },
      p: ['Because these services are free and can change, the list is kept up to date with each release. Pictures and videos are never copied into Linkivo; only their addresses are kept.'] },

    { id: 'storage', h: 'Cookies and storage on your device', items: [
      'Linkivo does not set advertising or tracking cookies and has no analytics.',
      'It uses your browser\'s storage to work: local storage for settings, IndexedDB for the cached library and unfinished jobs, and the service worker\'s cache for the app files, so the app opens quickly and can open offline.',
      'Firebase Authentication keeps your sign-in in the browser\'s storage so you stay signed in.',
      'Clearing your browser data removes all of this. For a guest that also removes the library.'] },

    { id: 'keep', h: 'How long things are kept', table: {
      head: ['Thing', 'How long'],
      rows: [
        ['Deleted folders and links', 'In the Recycle Bin for 15 days, then removed for good. You can restore or empty it earlier.'],
        ['A deleted account', 'Marked as deleted and kept for 15 days so you can reactivate it. After that the sign-in and all of its data are removed for good.'],
        ['History', 'For the time you chose (off to 30 days). Older entries are removed when the app starts and when you open History.'],
        ['Finished background jobs', 'Removed on the server two days after they finish; the list in the app hides them after 24 hours.'],
        ['Signed-in devices', 'Until you remove them from the list or delete the account.'],
        ['A guest\'s library', 'Until the browser data is cleared or the guest data is moved into an account.']] } },

    { id: 'rights', h: 'Your choices and your control', items: [
      'Export: every folder and link, in the Linkivo backup format (which can be protected with a passphrase) or in PDF, Excel, CSV, JSON, text, Markdown, bookmarks HTML, printable HTML and OPML. Locked folders are never written into an export.',
      'Delete: single links and folders, the Recycle Bin, the history, and the device list entries.',
      'Delete the whole account: Settings > Account. You get a summary first, and 15 days to change your mind.',
      'Keep it local: leave History on this device, switch pictures and screenshots off, switch off remembered searches.',
      `Anything else, such as a copy of your data or a deletion you cannot do yourself: write to ${CONTACT}.`] },

    { id: 'children', h: 'Younger users', p: ['Linkivo is a general tool and does not ask for a date of birth to sign in. If you are young, ask a parent or guardian before you create an account. The profile birthday is optional and only shown on your own profile.'] },

    { id: 'changes', h: 'Changes to this page', p: [`This page describes the app as of ${LEGAL_UPDATED}. When Linkivo changes in a way that affects your data, this page is changed in the same release and the date above is updated.`] }
  ]
};

export const TERMS = {
  title: 'Terms of use',
  lead: 'The simple rules for using Linkivo. They are written in plain language and are not a lawyer\'s document.',
  summary: [
    'Linkivo is free and provided as it is, by one developer, on free hosting plans.',
    'Your links belong to you. You are responsible for what you save and for keeping a backup.',
    'Do not misuse the service or try to break it.',
    'You can stop at any time: export your data and delete your account.'
  ],
  sections: [
    { id: 'accept', h: 'Using Linkivo means you accept these terms', p: ['By opening or using Linkivo, as a guest or with an account, you agree to these terms and to the Privacy page. If you do not agree, please do not use it.'] },

    { id: 'service', h: 'What Linkivo is', p: ['Linkivo is a link manager that runs in the browser and can be installed as an app. It lets you save links in folders, import and export them, search, preview, rediscover and protect them. Linkivo stores addresses and details about pages. It does not host, copy or own the pages, pictures or videos that your links point to.'] },

    { id: 'free', h: 'Free, as it is, and not always available', items: [
      'Linkivo is free. There is no paid plan and no ads.',
      'It runs on the free plans of Firebase and Cloudflare, which have limits and can change. The service can be slow, limited or unavailable, and some features (for example fetching titles for very many links) can stop when a free limit is reached.',
      'Linkivo is provided "as it is", without a promise that it will always work, be free of mistakes, or keep running. Features can change or be removed.'] },

    { id: 'account', h: 'Your account', items: [
      'Keep your sign-in, your PIN and your locked-folder code to yourself. What happens in your account with them is your responsibility.',
      'A forgotten app PIN can be reset after you sign in again; a guest who forgets the PIN has to erase the device data, because nobody else holds it. Linkivo cannot recover a lost backup passphrase.',
      'You can delete your account in Settings. It is kept for 15 days so that you can reactivate it, then removed for good.'] },

    { id: 'content', h: 'Your links and your data', items: [
      'You keep all rights to what you save. Linkivo only stores it to give you the service.',
      'You are responsible for the links you save and for how you use them. Do not use Linkivo to store or share anything illegal or that harms other people.',
      'Pages that a link opens belong to their owners. Their content, availability and rules are not controlled by Linkivo; some sites refuse to be shown inside another page.',
      'Titles, descriptions and pictures come from other services and the pages themselves and can be missing or wrong.'] },

    { id: 'backup', h: 'Backups are your responsibility', p: ['A guest\'s library lives only on one device. Even with an account, a mistake, a bug or a free-plan limit can lose data. Make a Linkivo backup now and then (the export popup has a reminder option). Linkivo is not responsible for data that is lost.'] },

    { id: 'use', h: 'Fair use', p: ['Please do not:'], items: [
      'try to reach other people\'s data, bypass the PIN, the locked folders or the database rules, or look for ways to break the service;',
      'send automated or very large numbers of requests, or use the Worker as a general-purpose proxy (it has limits per account and per network address on purpose);',
      'use Linkivo to send spam, to attack other sites, or to read pages you are not allowed to read;',
      'upload a profile photo that you have no right to use or that is harmful.'],
      },

    { id: 'ending', h: 'Ending access', p: ['You can stop using Linkivo at any time. Access can be limited or ended for someone who breaks these terms or puts the service or other people at risk. Because it is a small free project, the service itself can also be changed or closed; if that happens, export your data first, which you can do at any time.'] },

    { id: 'liability', h: 'Limits of responsibility', p: ['To the extent the law allows, the developer is not responsible for losses that come from using Linkivo or from not being able to use it, including lost data, lost links, or what other sites show. Nothing in these terms limits rights that the law gives you and that cannot be limited.'] },

    { id: 'privacy', h: 'Privacy', p: ['How data is handled is described on the Privacy page, which is part of these terms.'] },

    { id: 'changes', h: 'Changes to these terms', p: [`These terms are valid as of ${LEGAL_UPDATED}. If they change in a way that matters, the new text appears here with a new date; continuing to use Linkivo after that means you accept the new terms.`] },

    { id: 'contact', h: 'Contact', p: [`Questions about these terms: ${CONTACT}. Linkivo is made by Muhtasim Rahman (Turzo).`] }
  ]
};
