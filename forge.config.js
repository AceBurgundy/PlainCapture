module.exports = {
  packagerConfig: {
    asar: true,
    icon: "./source/assets/logo/switch.png"
  },

  rebuildConfig: {},

  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        iconUrl: "https://drive.google.com/uc?export=download&id=1gNKGr1ZTVR7cthuq7snxj5MDmFzpdm_K",
        setupIcon: "./source/assets/logo/switch.ico"
      }
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"]
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        icon: "./source/assets/logo/switch.png"
      }
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {
        icon: "./source/assets/logo/switch.png"
      }
    }
  ],

  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {}
    }
  ]
};