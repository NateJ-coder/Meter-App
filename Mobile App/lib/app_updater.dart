import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:http/http.dart' as http;

/// Checks for app updates and manages APK download/installation
class AppUpdater {
  static const versionCheckUrl = 'https://app.fuzio.co.za/version.json';

  /// Check if an update is available
  static Future<UpdateInfo?> checkForUpdate({http.Client? client}) async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentBuildNumber = int.tryParse(packageInfo.buildNumber) ?? 0;

        final response = await (client == null
          ? http.get(Uri.parse(versionCheckUrl))
          : client.get(Uri.parse(versionCheckUrl)))
          .timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) return null;

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final latestVersion = data['version'] as String;
      final latestBuildNumber = data['buildNumber'] as int;
      final apkUrl = data['apkUrl'] as String;
      final updateMessage = data['message'] as String?;
      final required = data['required'] as bool? ?? false;

      // Compare build numbers (more reliable than version strings)
      if (latestBuildNumber > currentBuildNumber) {
        return UpdateInfo(
          version: latestVersion,
          buildNumber: latestBuildNumber,
          apkUrl: apkUrl,
          message: updateMessage,
          required: required,
        );
      }

      return null;
    } catch (e) {
      debugPrint('Update check failed: $e');
      return null;
    }
  }

  /// Download and install the update APK
  static Future<void> downloadAndInstall(
    BuildContext context,
    UpdateInfo updateInfo, {
    required Function(double progress) onProgress,
    required CancelToken cancelToken,
  }) async {
    try {
      final dir = await getExternalStorageDirectory();
      if (dir == null) throw Exception('Storage not available');

      final apkPath = '${dir.path}/fuzio_meter_reader_update.apk';
      final file = File(apkPath);

      // Delete old APK if exists
      if (await file.exists()) {
        await file.delete();
      }

      // Download with progress
      final dio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(minutes: 5),
        sendTimeout: const Duration(seconds: 30),
      ));
      
      await dio.download(
        updateInfo.apkUrl,
        apkPath,
        cancelToken: cancelToken,
        onReceiveProgress: (received, total) {
          if (total > 0) {
            onProgress(received / total);
          } else {
            // If total is unknown, show indeterminate progress
            debugPrint('Downloaded $received bytes (size unknown)');
          }
        },
      );

      // Install APK (prompts user to install)
      final result = await OpenFilex.open(apkPath);
      if (result.type != ResultType.done) {
        throw StateError('Could not open the Android installer: ${result.message}');
      }
    } on DioException {
      rethrow;
    } catch (e) {
      throw Exception('Download failed: $e');
    }
  }

  /// Show update dialog to user
  static Future<void> showUpdateDialog(
    BuildContext context,
    UpdateInfo updateInfo,
  ) async {
    await showDialog(
      context: context,
      barrierDismissible: !updateInfo.required,
      builder: (context) => _UpdateDialog(updateInfo: updateInfo),
    );
  }
}

class UpdateInfo {
  final String version;
  final int buildNumber;
  final String apkUrl;
  final String? message;
  final bool required;

  UpdateInfo({
    required this.version,
    required this.buildNumber,
    required this.apkUrl,
    this.message,
    this.required = false,
  });
}

class _UpdateDialog extends StatefulWidget {
  final UpdateInfo updateInfo;

  const _UpdateDialog({required this.updateInfo});

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  bool _downloading = false;
  double _progress = 0.0;
  String? _error;
  CancelToken? _cancelToken;

  @override
  void dispose() {
    _cancelToken?.cancel('Update dialog closed');
    super.dispose();
  }

  Future<void> _startDownload() async {
    setState(() {
      _downloading = true;
      _error = null;
      _cancelToken = CancelToken();
    });

    try {
      await AppUpdater.downloadAndInstall(
        context,
        widget.updateInfo,
        onProgress: (progress) {
          if (mounted) setState(() => _progress = progress);
        },
        cancelToken: _cancelToken!,
      );

      if (mounted) {
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (!mounted) return;
      if (e is DioException && e.type == DioExceptionType.cancel) {
        setState(() {
          _downloading = false;
          _error = 'Download cancelled';
        });
      } else {
        setState(() {
          _downloading = false;
          _error = e.toString();
        });
      }
    }
  }

  void _cancelDownload() {
    _cancelToken?.cancel('User cancelled');
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.system_update, color: Colors.blue),
          const SizedBox(width: 12),
          Text('Update Available'),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Version ${widget.updateInfo.version} is now available!',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          if (widget.updateInfo.message != null) ...[
            const SizedBox(height: 12),
            Text(widget.updateInfo.message!),
          ],
          if (_downloading) ...[
            const SizedBox(height: 16),
            LinearProgressIndicator(value: _progress),
            const SizedBox(height: 8),
            Text(
              'Downloading... ${(_progress * 100).toStringAsFixed(0)}%',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              'Error: $_error',
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
      actions: [
        if (!_downloading && !widget.updateInfo.required)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Later'),
          ),
        if (_downloading)
          TextButton(
            onPressed: _cancelDownload,
            child: const Text('Cancel'),
          ),
        if (!_downloading && _error == null)
          FilledButton(
            onPressed: _startDownload,
            child: const Text('Update Now'),
          ),
        if (!_downloading && _error != null)
          FilledButton(
            onPressed: _startDownload,
            child: const Text('Retry'),
          ),
      ],
    );
  }
}
