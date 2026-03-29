import './excel-motion-loading.css';

type Props = {
  /** 뷰박스 기준 px (기본 31) */
  size?: number;
  className?: string;
  /** 스크린리더용 */
  label?: string;
};

/**
 * Figma `ewxel/motion/Loading` 대응 — SVG 링 스피너 (애니메이션)
 */
export function ExcelMotionLoading({ size = 31, className, label }: Props) {
  return (
    <svg
      className={'excel-motion-loading' + (className ? ' ' + className : '')}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={label ? 'img' : 'presentation'}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      {label ? <title>{label}</title> : null}
      <circle className="excel-motion-loading__track" cx="16" cy="16" r="12" />
      <g className="excel-motion-loading__spin">
        <circle className="excel-motion-loading__arc" cx="16" cy="16" r="12" />
      </g>
    </svg>
  );
}
