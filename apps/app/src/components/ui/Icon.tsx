import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'home' | 'list' | 'video' | 'alert' | 'user' | 'back' | 'share' | 'chevron'
  | 'check' | 'camera' | 'phone' | 'lock' | 'upload' | 'trash' | 'image' | 'file' | 'logout'
  | 'dashcam' | 'message' | 'plus' | 'close' | 'bell';

// 24x24 선 아이콘 모양
const shapes: Record<IconName, ReactNode> = {
  home: <Path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" />,
  list: <><Rect x="3" y="4" width="18" height="16" rx="3" /><Path d="M8 9h8M8 13h5" /></>,
  video: <><Rect x="3" y="6" width="13" height="12" rx="2" /><Path d="M16 10l5-3v10l-5-3" /></>,
  alert: <><Path d="M12 3l9 16H3z" /><Path d="M12 10v4M12 17h.01" /></>,
  user: <><Circle cx="12" cy="8" r="4" /><Path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  back: <Path d="M15 5l-7 7 7 7" />,
  share: <Path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" />,
  chevron: <Path d="M9 5l7 7-7 7" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  camera: <><Rect x="3" y="7" width="18" height="12" rx="2" /><Circle cx="12" cy="13" r="3" /></>,
  phone: <><Rect x="7" y="2" width="10" height="20" rx="2" /><Path d="M11 18h2" /></>,
  lock: <><Rect x="5" y="11" width="14" height="10" rx="2" /><Path d="M8 11V8a4 4 0 018 0v3" /></>,
  upload: <Path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />,
  trash: <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  file: <><Path d="M6 3h8l4 4v14H6z" /><Path d="M14 3v4h4M9 12h6M9 16h4" /></>,
  logout: <Path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  dashcam: <><Rect x="3" y="7" width="18" height="12" rx="3" /><Circle cx="12" cy="13" r="3" /><Path d="M8 4h8M17.5 10h.01" /></>,
  message: <Path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-5 4V6a1 1 0 011-1z" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  bell: <Path d="M18 9a6 6 0 00-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9zM10 20a2 2 0 004 0" />,
  image: <><Rect x="3" y="4" width="18" height="16" rx="2" /><Circle cx="9" cy="10" r="1.5" /><Path d="M21 16l-5-5-9 9" /></>,
};

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {shapes[name]}
    </Svg>
  );
}
