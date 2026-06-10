import ExpoModulesCore
import UIKit

public final class ExpoGlassSurfaceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoGlassSurface")

    View(GlassSurfaceView.self) {
      Prop("variant") { (view, variant: String?) in
        view.variant = variant ?? "floating"
      }

      Prop("cornerRadius") { (view, cornerRadius: Double?) in
        view.cornerRadius = CGFloat(cornerRadius ?? 16)
      }

      Prop("tintColor") { (view, tintColor: UIColor?) in
        view.tintColorOverride = tintColor
      }

      Prop("interactive") { (view, interactive: Bool?) in
        view.interactive = interactive ?? false
      }

      Prop("fallbackOpacity") { (view, fallbackOpacity: Double?) in
        view.fallbackOpacity = CGFloat(fallbackOpacity ?? 0.85)
      }

      Prop("reduceTransparencyFallbackColor") { (view, color: UIColor?) in
        view.reduceTransparencyFallbackColor = color ?? UIColor.white.withAlphaComponent(0.85)
      }
    }
  }
}
