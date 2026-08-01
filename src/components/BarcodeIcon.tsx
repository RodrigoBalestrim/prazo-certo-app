import Svg, { Rect } from "react-native-svg";

type BarcodeIconProps = {
  size?: number;
  color?: string;
};

export function BarcodeIcon({ size = 25, color = "#1E7A55" }: BarcodeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect x="2" y="4" width="2" height="24" rx="1" fill={color} />
      <Rect x="6" y="4" width="1.5" height="24" rx=".75" fill={color} />
      <Rect x="10" y="4" width="3" height="24" rx="1" fill={color} />
      <Rect x="15" y="4" width="1.5" height="24" rx=".75" fill={color} />
      <Rect x="19" y="4" width="2.5" height="24" rx="1" fill={color} />
      <Rect x="24" y="4" width="1.5" height="24" rx=".75" fill={color} />
      <Rect x="28" y="4" width="2" height="24" rx="1" fill={color} />
    </Svg>
  );
}
