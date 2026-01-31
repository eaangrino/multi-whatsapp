{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = with pkgs; [
    nodejs_22

    # Electron runtime deps
    gtk3
    glib
    nss
    nspr
    atk
    at-spi2-atk
    cups
    libdrm
    mesa
    libxkbcommon
    alsa-lib
    dbus
    pango
    cairo
    expat
    dbus
    xorg.libX11
    xorg.libXcursor
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXi
    xorg.libXrandr
    xorg.libXScrnSaver
    xorg.libXtst
  ];

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath [
      pkgs.glib
      pkgs.gtk3
      pkgs.nss
      pkgs.nspr
    ]}
  '';
}
