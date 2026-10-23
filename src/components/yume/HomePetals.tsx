import { useMemo } from "react";

/** Decorative sakura petals behind the homepage UI; never intercepts input. */
export function HomePetals() {
  const petals = useMemo(() => Array.from({ length: 30 }, (_, index) => ({
    id: index,
    left: `${(index * 37 + 11) % 100}%`,
    delay: `${(index % 15) * -1.7}s`,
    duration: `${14 + ((index * 13) % 12)}s`,
    size: `${13 + ((index * 11) % 17)}px`,
    drift: `${((index * 29) % 180) - 90}px`,
    rotate: `${(index * 47) % 360}deg`,
    blur: index % 6 === 0 ? "1px" : "0px",
    opacity: 0.3 + ((index * 7) % 35) / 100,
  })), []);

  return (
    <div className="yume-home-petals" aria-hidden="true">
      {petals.map((petal) => (
        <span
          key={petal.id}
          className="yume-home-petal"
          style={{
            left: petal.left,
            animationDelay: petal.delay,
            animationDuration: petal.duration,
            width: petal.size,
            height: `calc(${petal.size} * 1.45)`,
            "--petal-drift": petal.drift,
            "--petal-rotate": petal.rotate,
            "--petal-blur": petal.blur,
            "--petal-opacity": petal.opacity,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
