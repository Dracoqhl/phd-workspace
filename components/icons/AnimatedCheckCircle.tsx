interface AnimatedCheckCircleProps {
  className?: string;
  size?: number;
}

export function AnimatedCheckCircle({ className = "", size = 16 }: AnimatedCheckCircleProps) {
  return (
    <svg
      aria-hidden="true"
      className={`animated-check-circle ${className}`}
      data-testid="animated-check-circle"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path className="animated-check-circle__check" d="M7 12.4l3.1 3.1L17.4 8.2" pathLength="1" />
      <circle className="animated-check-circle__circle" cx="12" cy="12" pathLength="1" r="9" />
    </svg>
  );
}
