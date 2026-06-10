import UIKit

public final class GlassSurfaceView: UIView {
  private let effectView = UIVisualEffectView(effect: nil)

  public var variant: String = "floating" {
    didSet { updateAppearance() }
  }

  public var cornerRadius: CGFloat = 16 {
    didSet { updateGeometry() }
  }

  public var tintColorOverride: UIColor? {
    didSet { updateAppearance() }
  }

  public var interactive: Bool = false {
    didSet { updateAppearance() }
  }

  public var fallbackOpacity: CGFloat = 0.85 {
    didSet { updateAppearance() }
  }

  public var reduceTransparencyFallbackColor: UIColor = UIColor.white.withAlphaComponent(0.85) {
    didSet { updateAppearance() }
  }

  override public init(frame: CGRect) {
    super.init(frame: frame)
    setupView()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    effectView.frame = bounds
    updateGeometry()
  }

  private func setupView() {
    backgroundColor = .clear
    clipsToBounds = true
    isUserInteractionEnabled = true

    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    effectView.isUserInteractionEnabled = true
    effectView.backgroundColor = .clear
    effectView.clipsToBounds = true
    effectView.layer.cornerCurve = .continuous

    addSubview(effectView)
    updateGeometry()
    updateAppearance()
  }

  private func updateGeometry() {
    layer.cornerRadius = cornerRadius
    layer.cornerCurve = .continuous
    layer.masksToBounds = true

    effectView.layer.cornerRadius = cornerRadius
    effectView.layer.cornerCurve = .continuous
    effectView.layer.masksToBounds = true
  }

  private func updateAppearance() {
    if UIAccessibility.isReduceTransparencyEnabled {
      effectView.effect = nil
      effectView.alpha = 1.0
      effectView.backgroundColor = reduceTransparencyFallbackColor
      return
    }

    effectView.backgroundColor = .clear

    if #available(iOS 26.0, *) {
      let effect = UIGlassEffect(style: .regular)
      effect.interactive = interactive
      effect.tintColor = resolvedTintColor()
      effectView.effect = effect
      effectView.alpha = 1.0
    } else {
      effectView.effect = UIBlurEffect(style: .systemMaterial)
      effectView.alpha = fallbackOpacity
    }
  }

  private func resolvedTintColor() -> UIColor? {
    let intensity = variantTintIntensity()

    guard let tintColorOverride else {
      return UIColor.white.withAlphaComponent(intensity)
    }

    return tintColorOverride.withAlphaComponent(max(0.08, min(1.0, intensity)))
  }

  private func variantTintIntensity() -> CGFloat {
    switch variant.lowercased() {
    case "floating": return 0.16
    case "control": return 0.22
    case "sheet": return 0.28
    case "search": return 0.34
    case "modal": return 0.42
    case "status": return 0.12
    default: return 0.16
    }
  }
}
