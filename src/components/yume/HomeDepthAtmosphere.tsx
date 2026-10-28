import halloweenBackground from "@/assets/yume-halloween-background.webp";
import { useHalloweenSeason } from "@/data/seasonal-theme";

/**
 * The regular YUME ambient backdrop becomes a seasonal desktop wallpaper
 * during October 28-November 2. The center of the artwork is intentionally
 * almost black so cards stay readable; phones do not use the wallpaper.
 */
export function HomeDepthAtmosphere() {
  const halloween = useHalloweenSeason();
  return (
    <div
      className={"yume-depth-atmosphere" + (halloween ? " yume-depth-atmosphere--halloween" : "")}
      style={halloween ? {
        backgroundImage: "url(" + halloweenBackground + ")",
        backgroundColor: "#000",
        backgroundPosition: "center top",
        backgroundSize: "100% auto",
        backgroundRepeat: "repeat-y",
      } : undefined}
      aria-hidden="true"
    />
  );
}
