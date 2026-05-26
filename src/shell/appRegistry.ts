export type EasyStudioAppId = 'script' | 'voice-video' | 'thumbnail' | 'easy-voice-viet';

export const appRegistry = [
  {
    id: 'script' as const,
    name: 'Easy Script',
    icon: 'script',
    description: '',
    folder: 'src/apps/easy-script',
    status: ''
  },
  {
    id: 'voice-video' as const,
    name: 'Easy Voice / Video',
    icon: 'voice',
    description: '',
    folder: 'src/apps/easy-voice-video',
    status: ''
  },
  {
    id: 'easy-voice-viet' as const,
    name: 'Easy Voice Việt',
    icon: 'easy-voice-viet',
    description: '',
    folder: 'src/apps/easy-voice-viet',
    status: ''
  },
  {
    id: 'thumbnail' as const,
    name: 'Easy Thumbnail',
    icon: 'thumbnail',
    description: '',
    folder: 'src/apps/easy-thumbnail',
    status: ''
  }
];

export type EasyStudioAppMeta = (typeof appRegistry)[number];
