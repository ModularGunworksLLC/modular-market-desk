#!/usr/bin/env python3
"""Replace em dashes in customer-facing theme copy with normal punctuation."""

from pathlib import Path

THEME = Path("/opt/bitnami/wordpress/wp-content/themes/modulargunworks")

# Exact string replacements (order matters for overlapping snippets).
REPLACEMENTS = [
    # Homepage hero + cards
    (
        "Modular Gunworks is a veteran-owned licensed FFL serving North Alabama—professional transfers, gunsmithing, and a deep online catalog shipped fast from right here.",
        "Modular Gunworks is a veteran-owned licensed FFL serving North Alabama. Professional transfers, gunsmithing, and a deep online catalog shipped fast from right here.",
    ),
    (
        "Integrity-first service—we treat transfers and local pickups with the same care as outbound orders.",
        "Integrity-first service. We treat transfers and local pickups with the same care as outbound orders.",
    ),
    (
        "Transfers at our Huntsville desk, gunsmithing, and help navigating compliant shipping—all in one place.",
        "Transfers at our Huntsville desk, gunsmithing, and help navigating compliant shipping, all in one place.",
    ),
    (
        "Same-day or next-business-day processing whenever possible—we ship compliant orders nationwide.",
        "Same-day or next-business-day processing whenever possible. We ship compliant orders nationwide.",
    ),
    (
        "Major manufacturers alongside hard-to-find parts—curated alongside our local counter service.",
        "Major manufacturers alongside hard-to-find parts, curated with our local counter service.",
    ),
    (
        "Huntsville Alabama’s Modular Gunworks is a veteran-owned gun shop and FFL—we welcome online buyers needing a receiving dealer, Alabama residents picking up transfers, and customers who shop our full ecommerce catalog.",
        "Huntsville Alabama’s Modular Gunworks is a veteran-owned gun shop and FFL. We welcome online buyers needing a receiving dealer, Alabama residents picking up transfers, and customers who shop our full ecommerce catalog.",
    ),
    # Contact / footer NAP
    (
        "Huntsville, AL — Huntsville-area FFL",
        "Huntsville, AL (Huntsville-area FFL)",
    ),
    # FFL page
    (
        "Modular Gunworks LLC is a licensed Federal Firearms Licensee (FFL) in Huntsville, Alabama—your receiving dealer for compliant online orders and out-of-state shipments.",
        "Modular Gunworks LLC is a licensed Federal Firearms Licensee (FFL) in Huntsville, Alabama. We are your receiving dealer for compliant online orders and out-of-state shipments.",
    ),
    (
        "Huntsville, AL — contact us for FFL shipping details",
        "Huntsville, AL. Contact us for FFL shipping details.",
    ),
    (
        "$20 — <?php esc_html_e( 'first firearm', 'modulargunworks' ); ?>",
        "$20 - <?php esc_html_e( 'first firearm', 'modulargunworks' ); ?>",
    ),
    (
        "$10 — <?php esc_html_e( 'each additional firearm (same transaction)', 'modulargunworks' ); ?>",
        "$10 - <?php esc_html_e( 'each additional firearm (same transaction)', 'modulargunworks' ); ?>",
    ),
    (
        "Request a transfer with us first — we send FFL shipping details to you or your seller, then you check out so the package routes to Modular Gunworks LLC.",
        "Request a transfer with us first. We send FFL shipping details to you or your seller, then you check out so the package routes to Modular Gunworks LLC.",
    ),
    (
        "may apply—especially for shipments we forwarded to another FFL on your behalf.",
        "may apply, especially for shipments we forwarded to another FFL on your behalf.",
    ),
    (
        "in their state of residence—we cannot transfer across state lines except as federal law allows.",
        "in their state of residence. We cannot transfer across state lines except as federal law allows.",
    ),
    # Services / gunsmithing / guide / FAQ / terms / returns / privacy
    (
        "submit photos online — we review every request in person before making an offer.",
        "submit photos online. We review every request in person before making an offer.",
    ),
    (
        "at competitive prices—cleaning, inspection, optics mounting, and simple sight installation.",
        "at competitive prices: cleaning, inspection, optics mounting, and simple sight installation.",
    ),
    (
        "when your firearm is ready — bring a valid ID",
        "when your firearm is ready. Bring a valid ID",
    ),
    (
        "unless the law mandates otherwise—review our",
        "unless the law mandates otherwise. Review our",
    ),
    (
        "glitches—see our",
        "glitches. See our",
    ),
    (
        "ammunition—but your location may differ.",
        "ammunition, but your location may differ.",
    ),
    (
        "Certain items—including firearms (once transfer paperwork is executed) and most ammunition sales—are generally",
        "Certain items, including firearms (once transfer paperwork is executed) and most ammunition sales, are generally",
    ),
    (
        "governmental authorities—including ATF NFA branch workflows",
        "governmental authorities, including ATF NFA branch workflows",
    ),
    (
        "additional notices or rights—we will comply",
        "additional notices or rights. We will comply",
    ),
]


def patch_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    original = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    # Sweep remaining em dashes in PHP content (not admin customizer titles in comments only).
    # Leave admin "Modular Gunworks — Local SEO" alone in Customizer UI if still present;
    # replace public meta descriptions that use em dash with colon/period patterns already covered.
    if text == original:
        return 0
    bak = path.with_suffix(path.suffix + ".bak-no-emdash")
    if not bak.exists():
        bak.write_text(original, encoding="utf-8")
    path.write_text(text, encoding="utf-8")
    return 1


def sweep_public_meta() -> None:
    """SEO meta strings: em dash -> colon or hyphen."""
    p = THEME / "inc" / "store-info.php"
    text = p.read_text(encoding="utf-8")
    original = text
    # Public-facing __( '... — ...' ) meta: use colon
    text = text.replace(" — ", ": ")
    # Keep admin section titles readable with colon too
    if text != original:
        bak = p.with_suffix(p.suffix + ".bak-no-emdash")
        if not bak.exists():
            bak.write_text(original, encoding="utf-8")
        p.write_text(text, encoding="utf-8")
        print("store-info.php: meta/admin labels cleaned")


def main() -> None:
    changed = 0
    for path in THEME.rglob("*.php"):
        # skip backups
        if ".bak-" in path.name:
            continue
        changed += patch_file(path)
    sweep_public_meta()
    # Report remaining em dashes in non-backup php
    left = []
    for path in THEME.rglob("*.php"):
        if ".bak-" in path.name:
            continue
        t = path.read_text(encoding="utf-8")
        if "—" in t or "&mdash;" in t:
            left.append(str(path.relative_to(THEME)))
    print(f"files_patched={changed}")
    print("remaining_emdash_files=" + (",".join(left) if left else "none"))


if __name__ == "__main__":
    main()
