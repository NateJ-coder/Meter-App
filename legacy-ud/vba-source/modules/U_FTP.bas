Attribute VB_Name = "U_FTP"
'' Set Constants
'Const FTP_TRANSFER_TYPE_ASCII = &H1
'Const FTP_TRANSFER_TYPE_BINARY = &H2
'Const INTERNET_DEFAULT_FTP_PORT = 21
'Const INTERNET_DEFAULT_HTTP_PORT = 80
'Const INTERNET_SERVICE_FTP = 1
'Const INTERNET_SERVICE_HTTP = 80
'Const INTERNET_FLAG_PASSIVE = &H8000000
'Const GENERIC_WRITE = &H40000000
'Const GENERIC_READ = &H80000000
'Const BUFFER_SIZE = 100
'Const PassiveConnection As Boolean = True
'Const MAX_PATH = 260
'
'Public Type FILETIME
'    dwLowDateTime As Long
'    dwHighDateTime As Long
'End Type
'
'Public Type WIN32_FIND_DATA
'    dwFileAttributes As Long
'    ftCreationTime As FILETIME
'    ftLastAccessTime As FILETIME
'    ftLastWriteTime As FILETIME
'    nFileSizeHigh As Long
'    nFileSizeLow As Long
'    dwReserved0 As Long
'    dwReserved1 As Long
'    cFileName As String * MAX_PATH
'    cAlternate As String * 14
'End Type
'
''''' Declare wininet.dll API Functions
''''Public Declare Function FtpSetCurrentDirectory Lib "wininet.dll" Alias "FtpSetCurrentDirectoryA" (ByVal hFtpSession As Long, ByVal lpszDirectory As String) As Boolean
''''Public Declare Function FtpGetCurrentDirectory Lib "wininet.dll" Alias "FtpGetCurrentDirectoryA" (ByVal hFtpSession As Long, ByVal lpszCurrentDirectory As String, lpdwCurrentDirectory As Long) As Boolean
''''Public Declare Function FtpCreateDirectory Lib "wininet.dll" Alias "FtpCreateDirectoryA" (ByVal hFtpSession As Long, ByVal strFilename As String) As Boolean
''''Public Declare Function FtpRemoveDirectory Lib "wininet.dll" Alias "FtpRemoveDirectoryA" (ByVal hFtpSession As Long, ByVal lpszDirectory As String) As Boolean
''''
''''Public Declare Function FtpGetFileSize Lib "wininet.dll" (ByVal hFile As Long, ByRef lpdwFileSizeHigh As Long) As Long
''''Public Declare Function InternetWriteFile Lib "wininet.dll" (ByVal hFile As Long, ByRef sBuffer As Byte, ByVal lNumBytesToWite As Long, dwNumberOfBytesWritten As Long) As Integer
''''Public Declare Function InternetReadFile Lib "wininet.dll" (ByVal hFile As Long, ByRef sBuffer As Byte, ByVal lNumBytesToRead As Long, dwNumberOfBytesRead As Long) As Integer
''''Public Declare Function FtpOpenFile Lib "wininet.dll" Alias "FtpOpenFileA" (ByVal hFtpSession As Long, ByVal sBuff As String, ByVal Access As Long, ByVal Flags As Long, ByVal Context As Long) As Long
''''Public Declare Function FtpPutFile Lib "wininet.dll" Alias "FtpPutFileA" (ByVal hFtpSession As Long, ByVal lpszLocalFile As String, ByVal lpszRemoteFile As String, ByVal dwFlags As Long, ByVal dwContext As Long) As Boolean
''''Public Declare Function FtpDeleteFile Lib "wininet.dll" Alias "FtpDeleteFileA" (ByVal hFtpSession As Long, ByVal lpszFileName As String) As Boolean
''''
''''Public Declare Function InternetCloseHandle Lib "wininet.dll" (ByVal hInet As Long) As Long
''''Public Declare Function InternetOpen Lib "wininet.dll" Alias "InternetOpenA" (ByVal sAgent As String, ByVal lAccessType As Long, ByVal sProxyName As String, ByVal sProxyBypass As String, ByVal lFlags As Long) As Long
''''Public Declare Function InternetConnect Lib "wininet.dll" Alias "InternetConnectA" (ByVal hInternetSession As Long, ByVal sServerName As String, ByVal nServerPort As Integer, ByVal sUsername As String, ByVal sPassword As String, ByVal lService As Long, ByVal lFlags As Long, ByVal lContext As Long) As Long
''''Public Declare Function FTPGetFile Lib "wininet.dll" Alias "FtpGetFileA" (ByVal hFtpSession As Long, ByVal lpszRemoteFile As String, ByVal lpszNewFile As String, ByVal fFailIfExists As Boolean, ByVal dwFlagsAndAttributes As Long, ByVal dwFlags As Long, ByVal dwContext As Long) As Boolean
''''
''''Public Declare Function FtpFindFirstFile Lib "wininet.dll" Alias "FtpFindFirstFileA" (ByVal hFtpSession As Long, ByVal lpszSearchFile As String, lpFindFileData As WIN32_FIND_DATA, ByVal dwFlags As Long, ByVal dwContent As Long) As Long
''''
''''Public Declare Function InternetFindNextFile Lib "wininet.dll" Alias "InternetFindNextFileA" (ByVal hFind As Long, lpvFindData As WIN32_FIND_DATA) As Long
''''Public Declare Function InternetGetLastResponseInfo Lib "wininet.dll" Alias "InternetGetLastResponseInfoA" (ByRef lpdwError As Long, ByVal lpszErrorBuffer As String, ByRef lpdwErrorBufferLength As Long) As Boolean
'''' Declare wininet.dll API Functions


'Public Declare PtrSafe Function FtpSetCurrentDirectory Lib "wininet.dll" Alias "FtpSetCurrentDirectoryA" (ByVal hFtpSession As LongPtr, ByVal lpszDirectory As String) As Boolean
'Public Declare PtrSafe Function FtpGetCurrentDirectory Lib "wininet.dll" Alias "FtpGetCurrentDirectoryA" (ByVal hFtpSession As LongPtr, ByVal lpszCurrentDirectory As String, lpdwCurrentDirectory As Long) As Boolean
'Public Declare PtrSafe Function FtpCreateDirectory Lib "wininet.dll" Alias "FtpCreateDirectoryA" (ByVal hFtpSession As LongPtr, ByVal strFilename As String) As Boolean
'Public Declare PtrSafe Function FtpRemoveDirectory Lib "wininet.dll" Alias "FtpRemoveDirectoryA" (ByVal hFtpSession As LongPtr, ByVal lpszDirectory As String) As Boolean
'
'Public Declare PtrSafe Function FtpGetFileSize Lib "wininet.dll" (ByVal hFile As LongPtr, ByRef lpdwFileSizeHigh As Long) As LongPtr
'Public Declare PtrSafe Function InternetWriteFile Lib "wininet.dll" (ByVal hFile As LongPtr, ByRef sBuffer As Byte, ByVal lNumBytesToWite As Long, dwNumberOfBytesWritten As Long) As Integer
'Public Declare PtrSafe Function InternetReadFile Lib "wininet.dll" (ByVal hFile As LongPtr, ByRef sBuffer As Byte, ByVal lNumBytesToRead As Long, dwNumberOfBytesRead As Long) As Integer
'Public Declare PtrSafe Function FtpOpenFile Lib "wininet.dll" Alias "FtpOpenFileA" (ByVal hFtpSession As LongPtr, ByVal sBuff As String, ByVal Access As Long, ByVal Flags As Long, ByVal Context As Long) As LongPtr
'Public Declare PtrSafe Function FtpPutFile Lib "wininet.dll" Alias "FtpPutFileA" (ByVal hFtpSession As LongPtr, ByVal lpszLocalFile As String, ByVal lpszRemoteFile As String, ByVal dwFlags As Long, ByVal dwContext As Long) As Boolean
'Public Declare PtrSafe Function FtpDeleteFile Lib "wininet.dll" Alias "FtpDeleteFileA" (ByVal hFtpSession As LongPtr, ByVal lpszFileName As String) As Boolean
'
'Public Declare PtrSafe Function InternetCloseHandle Lib "wininet.dll" (ByVal hInet As LongPtr) As LongPtr
'Public Declare PtrSafe Function InternetOpen Lib "wininet.dll" Alias "InternetOpenA" (ByVal sAgent As String, ByVal lAccessType As Long, ByVal sProxyName As String, ByVal sProxyBypass As String, ByVal lFlags As Long) As LongPtr
'Public Declare PtrSafe Function InternetConnect Lib "wininet.dll" Alias "InternetConnectA" (ByVal hInternetSession As LongPtr, ByVal sServerName As String, ByVal nServerPort As Integer, ByVal sUsername As String, ByVal sPassword As String, ByVal lService As Long, ByVal lFlags As Long, ByVal lContext As Long) As LongPtr
'Public Declare PtrSafe Function FTPGetFile Lib "wininet.dll" Alias "FtpGetFileA" (ByVal hFtpSession As LongPtr, ByVal lpszRemoteFile As String, ByVal lpszNewFile As String, ByVal fFailIfExists As Boolean, ByVal dwFlagsAndAttributes As Long, ByVal dwFlags As Long, ByVal dwContext As Long) As Boolean
'
'Public Declare PtrSafe Function FtpFindFirstFile Lib "wininet.dll" Alias "FtpFindFirstFileA" (ByVal hFtpSession As LongPtr, ByVal lpszSearchFile As String, lpFindFileData As WIN32_FIND_DATA, ByVal dwFlags As Long, ByVal dwContent As Long) As LongPtr
'
'Public Declare PtrSafe Function InternetFindNextFile Lib "wininet.dll" Alias "InternetFindNextFileA" (ByVal hFind As LongPtr, lpvFindData As WIN32_FIND_DATA) As LongPtr
'Public Declare PtrSafe Function InternetGetLastResponseInfo Lib "wininet.dll" Alias "InternetGetLastResponse" ()


'' #############################################################################################################################
'Sub Upload_This_Sheet_Data(Building_Name, hConnection)
'
'        FolderPath = Application.ActiveWorkbook.Path & "\Building_Data"
'        Ans = Dir(FolderPath, vbDirectory):    If Ans = vbNullString Then VBA.FileSystem.MkDir (FolderPath)
'
'        ' ----- SETS UP FILENAME ----
'            JustFileName = Building_Name & ".Readings"
'            Filename = FolderPath & "\" & JustFileName
'
'        ' ----- WRITES THE FILE TO DISK ----                          ##########  SAVE FILE
'            Sheets(Building_Name).Cells.Copy
'            With New DataObject
'                .GetFromClipboard
'                Open Filename For Output As #1: Print #1, .GetText: Close #1
'            End With
'        ' -------------------------------------------------------------------------------------------------
'
'        ' ---- UPLOADS FILE ----
'            strRemoteFile = "/" & JustFileName '                         ##########  UPLOAD FILE
'            If FtpPutFile(hConnection, Filename, strRemoteFile, FTP_TRANSFER_TYPE_UNKNOWN Or INTERNET_FLAG_RELOAD, 0) Then
'                'MsgBox ("Success")
'            Else
'                MsgBox ("Error uploading file: " & JustFileName)
'            End If
'
'End Sub
'
'Sub UPLOADING_TO_CLOUD()
'
'    Ans = MsgBox("Upload Reading Data to the Cloud?", vbYesNoCancel, "UPLOAD READINGS")
'    If Ans <> vbYes Then Exit Sub
'
'    frmMessage.Show (0)
'    frmMessage.Caption = " ESTABLISHING AN INTERNET CONNECTION"
'    frmMessage.lblStatus.Caption = "Running..."
'    frmMessage.ProgressBar.Width = 1
'    frmMessage.ProgressBar.Left = 0
'
'
'    ' #### SET UP AND ESTABLISH FTP CONNECTION ####################################################################################
'
'           Ftp_Address = "ftp.greaves.co.za"
'           Username = Sheets("Settings").Range("Agent_Username").Value & "@greaves.co.za"
'           Password = Sheets("Settings").Range("Agent_Password").Value
'
'           ' Connect to FTP
'           Dim hConnection, hOpen As Long
'           hOpen = InternetOpen("FTP", 1, "", vbNullString, 0) ' Open Internet Connecion
'           hConnection = InternetConnect(hOpen, Ftp_Address, INTERNET_DEFAULT_FTP_PORT, Username, Password, INTERNET_SERVICE_FTP, IIf(PassiveConnection, INTERNET_FLAG_PASSIVE, 0), 0)
'
'            If hConnection = 0 Then
'                frmMessage.Hide
'                Ans = MsgBox("Cannot make connection at this time." _
'                  & vbCrLf & "If connection problem persists, please do the following:" & vbCrLf & _
'                            "1. Check that this device has a WIFI Connection" & vbCrLf & _
'                            "2. Check there is a working Internet Connection" & vbCrLf & _
'                            " " & vbCrLf & _
'                            "For this service to work, you will need " & vbCrLf & _
'                            "1. A Username and Password" & vbCrLf & _
'                            "2. An online account setup for you" & vbCrLf & _
'                            "3. An active Software License" & vbCrLf & vbCrLf & _
'                            "Contact James Greaves +27 82 7737 850", vbOKOnly, "NO CONNECTION ESTABLISHED")
'
'
'            Exit Sub
'            End If
'
'            frmMessage.Caption = "    UPLOADING TO THE CLOUD"
'    ' #### SET UP  ##################################################################################################
'            Dim ThisRange As Range
'            FolderPath = Application.ActiveWorkbook.Path & "\Building_Data"
'            Ans = Dir(FolderPath, vbDirectory):    If Ans = vbNullString Then VBA.FileSystem.MkDir (FolderPath)
'
'        ' Count the number of buildings in the Main Menu List
'            List_Top_Col = Sheets("Home").Range("Building_List_Top").Column
'            List_Top_Row = Sheets("Home").Range("Building_List_Top").Row
'            Building_Name = Sheets("Home").Cells(List_Top_Row, List_Top_Col) ' Gets first Building Abbreviation
'            Building_Count = 0
'            While Building_Name > ""
'                Building_Count = Building_Count + 1
'                List_Top_Row = List_Top_Row + 1
'                Building_Name = Sheets("Home").Cells(List_Top_Row, List_Top_Col)
'            Wend
'
'        ' ### PROGRESS BAR SETUP ###
'            ProgressMax = frmMessage.panelProgress.Width
'            ProgressStep = ProgressMax / Building_Count
'            frmMessage.ProgressBar.Left = -2
'            frmMessage.ProgressBar.Width = 1
'        ' ######
'
'        ' Get top of building list and First Building details -----------------------
'            List_Top_Col = Sheets("Home").Range("Building_List_Top").Column
'            List_Top_Row = Sheets("Home").Range("Building_List_Top").Row
'            Building_Name = Sheets("Home").Cells(List_Top_Row, List_Top_Col) ' Gets first Building Abbreviation
'
'   ' #### ITERATE THROUGH BUILDINGS ###############################################################################################
'            Progress_Count = 0
'            While Building_Name > ""
'                Progress_Count = Progress_Count + 1
'                frmMessage.lblProgress.Caption = "UPLOADING: " & Progress_Count & "/" & Building_Count & "   > " & Building_Name
'
'
'            ' ----- SETS UP FILENAME ----
'                Dim f As Integer: Dim Ext As String
'                f = InStr(1, Building_Name, "TARIFF", vbTextCompare)
'                If f > 0 Then Ext = ".ini" Else Ext = ".Readings"
'
'                JustFileName = Building_Name & Ext
'                Filename = FolderPath & "\" & JustFileName
'
'
'
'            ' ----- WRITES THE FILE TO DISK ----                          ##########  SAVE FILE
'                Sheets(Building_Name).Cells.Copy
'                With New DataObject
'                    .GetFromClipboard
'                    Open Filename For Output As #1: Print #1, .GetText: Close #1
'                End With
'            ' -------------------------------------------------------------------------------------------------
'
'
'            ' ---- UPLOADS FILE ----
'                strRemoteFile = "/" & JustFileName '                         ##########  UPLOAD FILE
'                If FtpPutFile(hConnection, Filename, strRemoteFile, FTP_TRANSFER_TYPE_UNKNOWN Or INTERNET_FLAG_RELOAD, 0) Then
'                    'MsgBox ("Success")
'                Else
'                    MsgBox ("Error uploading file: " & JustFileName)
'                End If
'
'                 Progress_Value = CInt(ProgressStep * Progress_Count)
'                 frmMessage.ProgressBar.Width = Progress_Value
'                 frmMessage.Repaint
'
'            ' ---- GO TO NEXT ON LIST ----
'                    List_Top_Row = List_Top_Row + 1
'                    Building_Name = Sheets("Home").Cells(List_Top_Row, List_Top_Col)
'
'                 DoEvents
'                 If frmMessage.lblStatus.Caption = "Cancel" Then
'                     Building_Name = ""
'                     frmMessage.Hide
'                 End If
'
'                frmMessage.Repaint
'            Wend
'
'    ' #### CLOSE FTP CONNECTION ###############################################################################################
'        Call InternetCloseHandle(hOpen)
'        Call InternetCloseHandle(hConnection)
'
'    ' #######################################################################################################################
'
'        Application.ScreenUpdating = True
'        frmMessage.Hide
'
'        Sheets("Settings").Range("Last_FTP_Action_Date") = "Uploaded: " & Format(Now, "long Date") & "   " & Format(Now, "Long Time")
'
'End Sub
'
'Sub DOWNLOADING_FROM_CLOUD()
'
'        RemSheet = ActiveSheet.Name
'        frmMessage.Show (0)
'        frmMessage.Caption = "    DOWNLOADING FROM THE CLOUD"
'        frmMessage.lblStatus.Caption = "Running..."
'        Application.ScreenUpdating = False
'
'
'  ' #### SET UP AND ESTABLISH FTP CONNECTION ####################################################################################
'
'       Ftp_Address = "ftp.greaves.co.za"
'       Username = Sheets("Settings").Range("Agent_Username").Value & "@greaves.co.za"
'       Password = Sheets("Settings").Range("Agent_Password").Value
'
'       ' Connect to FTP
'       Dim hConnection, hOpen As Long
'       hOpen = InternetOpen("FTP", 1, "", vbNullString, 0) ' Open Internet Connecion
'       hConnection = InternetConnect(hOpen, Ftp_Address, INTERNET_DEFAULT_FTP_PORT, Username, Password, INTERNET_SERVICE_FTP, IIf(PassiveConnection, INTERNET_FLAG_PASSIVE, 0), 0)
'
'       If hConnection = 0 Then MsgBox ("Connection Error" & vbCrLf & "1. Check Internet Connection" & vbCrLf & _
'                                                                     "2. Check Username and Password" & vbCrLf & _
'                                                                     "3. Account has not been setup" & vbCrLf & _
'                                                                     "4. Check Service License"): Exit Sub
'
'' #############################################################################################################################
'
' '  GET LIST OF BUILDINGS
'        Local_Folder_Path = Application.ActiveWorkbook.Path & "\Building_Data"
'        Ans = Dir(Local_Folder_Path, vbDirectory):    If Ans = vbNullString Then VBA.FileSystem.MkDir (Local_Folder_Path)
'
'        Dim Buildings() As String
'        Buildings = FTPList(Ftp_Address, Username, Password, "/")
'
'        '====================================================
'        Building_Count = UBound(Buildings) - 3
'        ProgressMax = frmMessage.panelProgress.Width
'        ProgressStep = ProgressMax / Building_Count
'        frmMessage.ProgressBar.Left = -2
'        frmMessage.ProgressBar.Width = 1
'        Progress_Count = 0
'        '===============================================
'
'        Dim Local_Filename As String
'        For Each Building_Filename In Buildings
'
'            If InStr(Building_Filename, ".Readings") > 0 Then
'
'                Online_Filename = "/" & Building_Filename
'
'                Local_Filename = Local_Folder_Path & "\" & Building_Filename
'                If fileExists(Local_Filename) = True Then Kill Local_Filename
'                Error_Message = ""
'
'               ' ### PROGRESS BAR ###
'
'                Trim_Building_Name = Mid(Building_Filename, 1, InStr(Building_Filename, ".") - 1)
'                frmMessage.lblProgress.Caption = "DOWNLOADING: " & Progress_Count & "/" & Building_Count & "   > " & Trim_Building_Name
'                Progress_Value = CInt(ProgressStep * Progress_Count)
'                frmMessage.ProgressBar.Width = Progress_Value
'                frmMessage.Repaint
'                Progress_Count = Progress_Count + 1
'                ' #######
'
'                ' *********  DOWNLOADS FILE  *********
'                    If FTPGetFile(hConnection, Online_Filename, Local_Filename, 1, 0, FTP_TRANSFER_TYPE_UNKNOWN Or INTERNET_FLAG_RELOAD, 0) Then
'                        ' MsgBox ("Success")
'                        f = InStr(Building_Filename, ".") - 1
'                        Building_Name = Mid$(Building_Filename, 1, f)
'
'                        ImportSheetData (Building_Name)
'                    Else
'                        Error_Message = Error_Message & vbCrLf & Building_Name
'                    End If
'
'                    frmMessage.Repaint
'            End If
'            Pause (0.1)
'            'frmMessage.Repaint
'        Next
'
'     ' #### CLOSE FTP CONNECTION ###############################################################################################
'        Call InternetCloseHandle(hOpen)
'        Call InternetCloseHandle(hConnection)
'
'    ' #######################################################################################################################
'        Application.ScreenUpdating = True
'        frmMessage.Hide
'
'        If Error_Message > "" Then
'            MsgBox ("No online data for buildings below:" & vbCrLf & vbCrLf & Error_Message)
'        Else
'         '   MsgBox ("Done!")
'        End If
'
'
'     Sheets(RemSheet).Select
'
'    Sheets("Settings").Range("Last_FTP_Action_Date") = "Downloaded: " & Format(Now, "long Date") & "   " & Format(Now, "Long Time")
'
'
'End Sub
'
'
'Function GetBuildingSheetName(Building_Name) As String
'
'    Building_List_Row = Sheets("Home").Range("Building_List_Top").Row
'    Building_List_Col = Sheets("Home").Range("Building_List_Top").Column
'
'    Row_Count = 0
'    This_Building_Name = Sheets("Home").Cells(Building_List_Row + Row_Count, Building_List_Col)
'
'    While This_Building_Name <> Building_Name Or Row_Count > 200
'        Row_Count = Row_Count + 1
'        This_Building_Name = Sheets("Home").Cells(Building_List_Row + Row_Count, Building_List_Col)
'    Wend
'    Sheet_Name = Sheets("Home").Cells(Building_List_Row + Row_Count, Building_List_Col)
'    GetBuildingSheetName = Sheet_Name
'
'
'End Function
'
'
'
'
'
'
'
'
'Sub FtpDownload(ByVal strRemoteFile As String, ByVal strLocalFile As String, ByVal strHost As String, ByVal lngPort As Long, ByVal strUser As String, ByVal strPass As String)
'    Dim hOpen, hConn  As Long
'    hOpen = InternetOpenA("FTPGET", 1, vbNullString, vbNullString, 1)
'    hConn = InternetConnectA(hOpen, strHost, lngPort, strUser, strPass, 1, 0, 2)
'
'    If FtpGetFileA(hConn, strRemoteFile, strLocalFile, 1, 0, FTP_TRANSFER_TYPE_UNKNOWN Or INTERNET_FLAG_RELOAD, 0) Then
'         MsgBox ("Success")
'    Else
'        MsgBox ("Error downloading file: " & strRemoteFile)
'    End If
'
'    'Close connections
'    InternetCloseHandle hConn
'    InternetCloseHandle hOpen
'End Sub
'
'Function FTPList(ByVal HostName As String, ByVal Username As String, ByVal Password As String, ByVal sDir As String) As String()
'
'        On Error GoTo Err_Function
'
'        Dim sOrgPAth As String
'        Dim pData As WIN32_FIND_DATA
'        Dim hFind As Long, lRet As Long
'        Dim hConnection, hOpen, hFile  As Long
'        Dim sFiles() As String
'        sPath = String(MAX_PATH, 0)
'
'        ' Open Internet Connecion
'            hOpen = InternetOpen("FTP", 1, "", vbNullString, 0)
'
'        ' Connect to FTP
'            hConnection = InternetConnect(hOpen, HostName, INTERNET_DEFAULT_FTP_PORT, Username, Password, INTERNET_SERVICE_FTP, IIf(PassiveConnection, INTERNET_FLAG_PASSIVE, 0), 0)
'
'        ' Change Directory
'            Call FtpSetCurrentDirectory(hConnection, sDir)
'
'        ' get list of directory
'            Call FtpGetCurrentDirectory(hConnection, sPath, Len(sPath))
'            pData.cFileName = String(MAX_PATH, 0)
'
'        'find the first file
'            hFind = FtpFindFirstFile(hConnection, "*.*", pData, 0, 0)
'
'        'if there are files
'            If hFind <> 0 Then
'
'                'set first file
'                ReDim Preserve sFiles(0)
'                sFiles(UBound(sFiles)) = Left(pData.cFileName, InStr(1, pData.cFileName, String(1, 0), vbBinaryCompare) - 1)
'                Do
'                    pData.cFileName = String(MAX_PATH, 0) 'create a buffer
'                    lRet = InternetFindNextFile(hFind, pData) 'find the next file
'                    If lRet = 0 Then Exit Do                    'if there's no next file, exit do
'                    ReDim Preserve sFiles(UBound(sFiles) + 1)
'                    'add additional files
'                    sFiles(UBound(sFiles)) = Left(pData.cFileName, InStr(1, pData.cFileName, String(1, 0), vbBinaryCompare) - 1)
'                Loop
'
'            End If
'
'Exit_Function:
'
'    ' Close Internet Connection
'        Call InternetCloseHandle(hOpen)
'        Call InternetCloseHandle(hConnection)
'        FTPList = sFiles
'        Exit Function
'
'Err_Function:
'    MsgBox "Error in FTPList : " & Err.Description
'GoTo Exit_Function
'
'End Function
'
'
'Sub Download_Submission()
'
'    ' Checks if a valid date cell has been selected
'        RemRow = ActiveCell.Row:         RemCol = ActiveCell.Column
'        If RemRow <> 1 Or RemCol < 5 Then MsgBox ("Please the month on the top row for the data you want to download"): Exit Sub
'
'    ' Gets the selected Building and Cell data
'        Building_Name = ActiveSheet.Name
'        Selected_Month = Format(ActiveCell.Value, "MMM-YY")
'        Dim Submit_Filename As String: Submit_Filename = Building_Name & " " & Selected_Month & ".Submit"
'
'    ' Shows a message that download is starting
'        frmMessage.Show (0)
'        frmMessage.Caption = "    Requesting: " & Submit_Filename
'        frmMessage.ProgressBar.Width = 1
'        frmMessage.ProgressBar.Left = -2
'
'  ' #### SET UP AND ESTABLISH FTP CONNECTION ####################################################################################
'
'       Ftp_Address = "ftp.greaves.co.za"
'       Username = Sheets("Settings").Range("Agent_Username").Value & "@greaves.co.za"
'       Password = Sheets("Settings").Range("Agent_Password").Value
'
'       ' Connect to FTP
'       Dim hConnection, hOpen As Long
'       hOpen = InternetOpen("FTP", 1, "", vbNullString, 0) ' Open Internet Connecion
'       hConnection = InternetConnect(hOpen, Ftp_Address, INTERNET_DEFAULT_FTP_PORT, Username, Password, INTERNET_SERVICE_FTP, IIf(PassiveConnection, INTERNET_FLAG_PASSIVE, 0), 0)
'
'       If hConnection = 0 Then
'            MsgBox ("Connection Error" & vbCrLf & "1. Check Internet Connection" & vbCrLf & _
'                                                                     "2. Check Username and Password" & vbCrLf & _
'                                                                     "3. Account has not been setup" & vbCrLf & _
'                                                                     "4. Check Software License"):
'            frmMessage.Hide
'            Exit Sub
'        End If
'
'' #############################################################################################################################
'
' '  Check if local folder exists otherwise make it
'        Local_Folder_Path = Application.ActiveWorkbook.Path & "\Building_Data"
'        Ans = Dir(Local_Folder_Path, vbDirectory):    If Ans = vbNullString Then VBA.FileSystem.MkDir (Local_Folder_Path)
'
'   '  Sets up the local and Online Filename a path
'        Dim Online_Filename As String: Online_Filename = "/" & Submit_Filename
'        Dim Local_Filename As String: Local_Filename = Local_Folder_Path & "\" & Submit_Filename
'            If fileExists(Local_Filename) = True Then Kill Local_Filename
'
'    ' *********  DOWNLOADS FILE  *********
'      If FTPGetFile(hConnection, Online_Filename, Local_Filename, 1, 0, FTP_TRANSFER_TYPE_UNKNOWN Or INTERNET_FLAG_RELOAD, 0) Then
'          Import_Submit_Data (Local_Filename)
'          MsgBox ("Import Complete!")
'      Else
'          MsgBox ("Readings for " & Building_Name & vbCrLf & "and the month " & Selected_Month & vbCrLf & "were not found online")
'      End If
'
'     ' #### CLOSE FTP CONNECTION ###############################################################################################
'        Call InternetCloseHandle(hOpen)
'        Call InternetCloseHandle(hConnection)
'
'    ' #######################################################################################################################
'        Application.ScreenUpdating = True
'        frmMessage.Hide
'
'    Sheets(Building_Name).Select
'
'End Sub
'
'Sub Import_Submit_Data(Local_Filename As String)
'    Dim Elec_Start_Row As Integer: Elec_Start_Row = FindRow(1, "ELECTRICITY")
'
'    Dim InputText As String
'    ff = FreeFile
'    Open Local_Filename For Input As #ff        ' Open file for input.
'        InputText = Input$(LOF(ff), ff)
'    Close #ff
'
'    Dim This_Data() As String
'    This_Data = Split(InputText, vbLf)
'
'    Dim line_Count As Integer: line_Count = -1
'    Dim This_Line() As String
'
'    Dim ThisName, Dat1, Dat2, Dat3, Dat4, Dat5 As String
'    ThisName = ""
'
'    Do While ThisName <> "ELECTRICITY"
'
'        line_Count = line_Count + 1
'        This_Line = Split(This_Data(line_Count), vbTab)
'        On Error Resume Next
'            ThisName = This_Line(0)
'            Dat1 = This_Line(1)
'            Dat2 = This_Line(2)
'            Dat3 = This_Line(3)
'            Dat4 = This_Line(4)
'            Dat5 = This_Line(5)
'        On Error GoTo 0
'
'    Loop
'    Dim Row_Offset As Integer:     Row_Offset = 0
'    Do While ThisName <> "END"
'
'        If Dat1 <> "START" Then Cells(Elec_Start_Row + Row_Offset, RemCol) = Dat1
'        Row_Offset = Row_Offset + 1
'
'        line_Count = line_Count + 1
'        This_Line = Split(This_Data(line_Count), vbTab)
'        On Error Resume Next
'            ThisName = This_Line(0)
'            Dat1 = This_Line(1)
'            Dat2 = This_Line(2)
'            Dat3 = This_Line(3)
'            Dat4 = This_Line(4)
'            Dat5 = This_Line(5)
'        On Error GoTo 0
'
'    Loop
'
'End Sub
