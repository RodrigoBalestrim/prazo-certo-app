/** Marca visual reutilizável do Prazo Certo. */
import Svg, { Circle, Path } from "react-native-svg";

type LogoMarkProps = {
  size?: number;
};

export function LogoMark({ size = 48 }: LogoMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Circle cx="512" cy="512" r="496" fill="#174D3B" />
      <Circle cx="512" cy="512" r="418" fill="#F7F3E8" />
      <Circle cx="512" cy="512" r="374" fill="none" stroke="#2A9167" strokeWidth="18" />
      <Circle cx="512" cy="512" r="250" fill="#174D3B" />
      <Circle cx="512" cy="512" r="205" fill="#F7F3E8" />
      <Circle cx="512" cy="512" r="170" fill="#E4F2EB" />
      <Circle cx="163" cy="512" r="28" fill="#E5AC4F" />
      <Circle cx="861" cy="512" r="28" fill="#E5AC4F" />
      <Path d="M438 376H586" stroke="#174D3B" strokeWidth="38" strokeLinecap="round" />
      <Path d="M438 648H586" stroke="#174D3B" strokeWidth="38" strokeLinecap="round" />
      <Path d="M460 398C460 461 489 481 512 512C535 481 564 461 564 398" stroke="#174D3B" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M460 626C460 563 489 543 512 512C535 543 564 563 564 626" stroke="#174D3B" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M414 576L474 628L616 458" stroke="#2A9167" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
