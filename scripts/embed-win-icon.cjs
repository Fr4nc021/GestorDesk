const fs = require('fs')
const path = require('path')
const { NtExecutable, NtExecutableResource, Data, Resource } = require('resedit')

function aplicarIconeNoExecutavel(exePath, iconPath) {
  const exe = NtExecutable.from(fs.readFileSync(exePath))
  const res = NtExecutableResource.from(exe)
  const iconFile = Data.IconFile.from(fs.readFileSync(iconPath))
  const grupos = Resource.IconGroupEntry.fromEntries(res.entries)
  const grupo = grupos[0]
  const iconGroupID = grupo ? grupo.id : 1
  const lang = grupo ? grupo.lang : 1033
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    iconGroupID,
    lang,
    iconFile.icons.map((item) => item.data)
  )
  res.outputResource(exe)
  fs.writeFileSync(exePath, Buffer.from(exe.generate()))
}

async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.join(context.packager.info.projectDir, 'build', 'icon.ico')
  aplicarIconeNoExecutavel(exePath, iconPath)
  console.log(`[icon] Logo aplicado em ${exePath}`)
}

module.exports = afterPack
module.exports.aplicarIconeNoExecutavel = aplicarIconeNoExecutavel
