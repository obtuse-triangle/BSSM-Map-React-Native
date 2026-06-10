import UIKit

/// A React Native Fabric-compatible glass surface view.
///
/// Uses a `UIView` wrapper with an internal `UIVisualEffectView` child.
/// React children are added directly to `self` (the wrapper), and the effect
/// view is kept behind them via `sendSubviewToBack` in `layoutSubviews`.
/// The effect view has `isUserInteractionEnabled = false` so touches pass through.
public final class GlassSurfaceView: UIView {

  // MARK: - React Props

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

  // MARK: - Internal effect view

  private let effectView: UIVisualEffectView

  // MARK: - Initialization

  override public var intrinsicContentSize: CGSize {
    CGSize(width: UIView.noIntrinsicMetric, height: UIView.noIntrinsicMetric)
  }

  override public init(frame: CGRect) {
    self.effectView = UIVisualEffectView(effect: nil)
    super.init(frame: frame)
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
    layer.cornerCurve = .continuous

    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    effectView.clipsToBounds = true
    effectView.layer.cornerCurve = .continuous
    effectView.layer.cornerRadius = cornerRadius
    effectView.isUserInteractionEnabled = false

    super.addSubview(effectView)

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleReduceTransparencyStatusDidChange(_:)),
      name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      object: nil
    )

    updateGeometry()
    updateAppearance()
  }

  // MARK: - Layout

  override public func layoutSubviews() {
    super.layoutSubviews()
    sendSubviewToBack(effectView)
    updateGeometry()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  // MARK: - Updates

  private func updateGeometry() {
    layer.cornerRadius = cornerRadius
    layer.masksToBounds = true
    effectView.layer.cornerRadius = cornerRadius
  }

  private func updateAppearance() {
    if UIAccessibility.isReduceTransparencyEnabled {
      effectView.effect = nil
      effectView.alpha = 1.0
      effectView.contentView.backgroundColor = reduceTransparencyFallbackColor
      return
    }

    effectView.contentView.backgroundColor = .clear

    if #available(iOS 26.0, *) {
      let glassEffect = UIGlassEffect(style: .regular)
      glassEffect.isInteractive = interactive
      glassEffect.tintColor = resolvedTintColor()
      effectView.effect = glassEffect
      effectView.alpha = 1.0
    } else {
      effectView.effect = UIBlurEffect(style: .systemMaterial)
      effectView.alpha = fallbackOpacity
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
