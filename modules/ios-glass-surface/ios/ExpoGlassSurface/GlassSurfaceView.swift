import UIKit

public final class GlassSurfaceView: UIVisualEffectView {

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
    super.init(effect: nil)
    setupView()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  private func setupView() {
    backgroundColor = .clear
    clipsToBounds = true
    isUserInteractionEnabled = true
    contentView.isUserInteractionEnabled = true
    layer.cornerCurve = .continuous

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleReduceTransparencyStatusDidChange(_:)),
      name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      object: nil
    )

    updateGeometry()
    updateAppearance()
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    updateGeometry()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  private func updateGeometry() {
    layer.cornerRadius = cornerRadius
    layer.masksToBounds = true
  }

  private func updateAppearance() {
    if UIAccessibility.isReduceTransparencyEnabled {
      effect = nil
      alpha = 1.0
      contentView.backgroundColor = reduceTransparencyFallbackColor
      return
    }

    contentView.backgroundColor = .clear

    if #available(iOS 26.0, *) {
      let glassEffect = UIGlassEffect(style: .regular)
      glassEffect.isInteractive = interactive
      glassEffect.tintColor = resolvedTintColor()
      effect = glassEffect
      alpha = 1.0
    } else {
      effect = UIBlurEffect(style: .systemMaterial)
      alpha = fallbackOpacity
    }
  }

  @objc private func handleReduceTransparencyStatusDidChange(_ notification: Notification) {
    updateAppearance()
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
