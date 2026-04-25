use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Sv2Status {
    Sv2Native,
    Sv1Translated,
}

pub fn classify(make: &str, model: &str, firmware: &str) -> Sv2Status {
    let m = make.to_lowercase();
    let mo = model.to_lowercase();
    let fw = firmware.to_lowercase();

    // Bitaxe firmware ≥ 2.5 ships native SV2 support. We match permissively because
    // the firmware string format varies across boards (Gamma / Supra / Ultra).
    let is_bitaxe = m.contains("bitaxe") || mo.contains("bitaxe") || mo.contains("nerdaxe");
    if is_bitaxe {
        if let Some(major) = parse_major_minor(&fw) {
            if major >= (2, 5) {
                return Sv2Status::Sv2Native;
            }
        }
    }

    // Everything else (Antminer, Whatsminer, BraiinsOS, LuxOS, VNish, ePIC, …)
    // currently goes through the Translator.
    Sv2Status::Sv1Translated
}

fn parse_major_minor(version: &str) -> Option<(u32, u32)> {
    let trimmed = version.trim_start_matches(|c: char| !c.is_ascii_digit());
    let mut parts = trimmed.split(|c: char| c == '.' || c == '-' || c == '_');
    let major: u32 = parts.next()?.parse().ok()?;
    let minor: u32 = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bitaxe_modern_firmware_is_native() {
        assert_eq!(classify("Bitaxe", "Gamma", "v2.5.1"), Sv2Status::Sv2Native);
        assert_eq!(classify("Bitaxe", "Supra", "2.7.0"), Sv2Status::Sv2Native);
    }

    #[test]
    fn bitaxe_old_firmware_translated() {
        assert_eq!(
            classify("Bitaxe", "Gamma", "v2.4.9"),
            Sv2Status::Sv1Translated
        );
    }

    #[test]
    fn antminer_translated() {
        assert_eq!(
            classify("Antminer", "S19j Pro", "Stock"),
            Sv2Status::Sv1Translated
        );
    }
}
