package expo.modules.orcaappupdate

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

class OrcaAppUpdateModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)
  private val packageFlags get() = if (Build.VERSION.SDK_INT >= 28)
    PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

  private fun version(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28)
    info.longVersionCode else info.versionCode.toLong()

  private fun installed() = context.packageManager.getPackageInfo(context.packageName, packageFlags)

  private fun signers(info: PackageInfo): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= 28)
      info.signingInfo?.apkContentsSigners else info.signatures
    return signatures?.map { it.toCharsString() }?.toSet() ?: emptySet()
  }

  private fun apk(): File = File(context.cacheDir, "integration-update/update.apk")

  private fun verify(expectedHash: String, expectedSize: Long, expectedVersion: Long) {
    val file = apk()
    require(file.isFile && file.length() == expectedSize) { "Update APK size mismatch." }
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    val hash = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
    require(hash == expectedHash) { "Update APK checksum mismatch." }
    val archive = requireNotNull(context.packageManager.getPackageArchiveInfo(file.path, packageFlags)) {
      "Update APK could not be read."
    }
    val current = installed()
    require(archive.packageName == context.packageName) { "Update APK belongs to another app." }
    require(version(archive) == expectedVersion && expectedVersion > version(current)) {
      "Update APK version does not match or is not newer."
    }
    val currentSigners = signers(current)
    require(currentSigners.isNotEmpty() && signers(archive) == currentSigners) {
      "Update APK signing certificate does not match this installation."
    }
  }

  override fun definition() = ModuleDefinition {
    Name("OrcaAppUpdate")

    Function("getVersionCode") { version(installed()).toDouble() }

    Function("canInstall") {
      Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()
    }

    AsyncFunction("verify") { sha256: String, bytes: Double, versionCode: Double ->
      verify(sha256, bytes.toLong(), versionCode.toLong())
    }

    AsyncFunction("requestPermission") {
      if (Build.VERSION.SDK_INT >= 26) {
        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("install") {
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.integrationupdates", apk())
      context.startActivity(Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }.runOnQueue(Queues.MAIN)
  }
}
