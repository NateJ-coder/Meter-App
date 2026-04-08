Attribute VB_Name = "C_Navigation"
    ' NAVIGATION %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
 Public RemCol, RemRow  As Integer

Sub Auto_Open()

    Dim ExpiryDate  As String
    ExpiryDate = "2136/04/19"
    
    Dim Expiry As String
    Expiry = Round(CDbl(CDate(ExpiryDate)), 0)
    
    Dim Today As String
        Today = Round(CDbl(Now()), 0)
    
    Dim Aging As String
    DaysLeft = Expiry - Today
    
    If DaysLeft < 0 Then
        MsgBox ("This License has expired, to renew" & vbCrLf & "please contact James Greaves +27 82 7737 850")
    Else
        Ans = MsgBox("This product is licensed to Fuzio" & vbCrLf & vbCrLf & "© 2021 James D Greaves" & vbCrLf & "(License valid for " & DaysLeft & " days)", vbOKCancel, "UTILITY DASH")
        If Ans <> vbOK Then Application.DisplayAlerts = False: Application.Quit
    End If
    
    
    If GetKeyState(SHIFT_KEY) < 0 Then
    Else
        If DaysLeft < -100 Then
            ThisWorkbook.Saved = True
            Application.Quit
         End If
    End If
    
End Sub


Sub GetLicence()

    Filename = FolderName & "\License.dat"
            
    Open Filename For Output As #1
         Input #1, License
    Close #1
    

End Sub
Sub Goto_Building()

End Sub

 Sub Action_Go()
Attribute Action_Go.VB_ProcData.VB_Invoke_Func = "G\n14"

' Keyboard Shortcut: Ctrl+Shift+G
' *********************************************************************
' ****** BASIC SETUP **************************************************************
   
    OutputPath = Application.ActiveWorkbook.Path
         '   OutputPath = Sheets("Settings").Range("C5")
    
    RemCol = ActiveCell.Column
    RemRow = ActiveCell.Row
    SheetName = ActiveSheet.Name   ' Get Current Sheet

    Select Case SheetName
     
        Case "Tariffs"
            On Error Resume Next
            If LastBuilding <> "" Then Sheets(LastBuilding).Select
            Exit Sub
    
        Case "WaterBreakdown", "ElecBreakDown"
            If ActiveCell.Row > 7 Then
                CreateInvoice (ActiveCell.Row)
            Else
                 MsgBox ("First select the UNIT you want to Invoice")
            End If
        
        Case Else
       ' If Len(SheetName) < 4 Then BreakDownCals  ' Perform full breakdown calcs  **** ROCKET - MAIN CALCS ******

    End Select
 
End Sub

Sub GetSharingOptions()
        
        ' Get Name of Sharing option
        ThisRowX = 3: ThisColumn = 1
        OptionText1 = Sheets(LastBuilding).Cells(ThisRowX + 1, ThisColumn)
        OptionText2 = Sheets(LastBuilding).Cells(ThisRowX + 2, ThisColumn)
        OptionText3 = Sheets(LastBuilding).Cells(ThisRowX + 3, ThisColumn)
        OptionText4 = Sheets(LastBuilding).Cells(ThisRowX + 4, ThisColumn)
        OptionText5 = Sheets(LastBuilding).Cells(ThisRowX + 5, ThisColumn)
        OptionText6 = Sheets(LastBuilding).Cells(ThisRowX + 6, ThisColumn)
        OptionText7 = Sheets(LastBuilding).Cells(ThisRowX + 7, ThisColumn)
        OptionText8 = Sheets(LastBuilding).Cells(ThisRowX + 8, ThisColumn)
        
        ' Get Sharing Option
        ThisRowX = 3: ThisColumn = 3
        OptionChoice1 = Sheets(LastBuilding).Cells(ThisRowX + 1, ThisColumn)
        OptionChoice2 = Sheets(LastBuilding).Cells(ThisRowX + 2, ThisColumn)
        OptionChoice3 = Sheets(LastBuilding).Cells(ThisRowX + 3, ThisColumn)
        OptionChoice4 = Sheets(LastBuilding).Cells(ThisRowX + 4, ThisColumn)
        OptionChoice5 = Sheets(LastBuilding).Cells(ThisRowX + 5, ThisColumn)
        OptionChoice6 = Sheets(LastBuilding).Cells(ThisRowX + 6, ThisColumn)
        OptionChoice7 = Sheets(LastBuilding).Cells(ThisRowX + 7, ThisColumn)
        OptionChoice8 = Sheets(LastBuilding).Cells(ThisRowX + 8, ThisColumn)

End Sub

Sub YellowRocket()
    NewCalc = False
    Launch_Rocket
End Sub

Sub Launch_Rocket()

    ClearImmediate
    StartTime = Timer
    SheetName = ActiveSheet.Name
    LastBuilding = ActiveSheet.Name
    RemRow = ActiveCell.Row
    RemCol = ActiveCell.Column
    
    
    CellText = Cells(RemRow, RemCol).Value
    
    
    Select Case RemRow
      Case 1                                       ' Month
          LastBuilding = ActiveSheet.Name
          RemRow = ActiveCell.Row
          RemCol = ActiveCell.Column
      
          If ActiveCell.Column < 5 Then
              MsgBox ("Select from the 2nd Month onward")
              Application.ScreenUpdating = True
              Exit Sub
          End If
                         
          Application.ScreenUpdating = False
    '-----------------------------------------------------
          If Load_Building_Data = True Then        '  ***** LOADS DATA INTO MEMORY FOR FAST PROCESSING *****
                     
       'Jamess       CalcSharedAmounts
              Sheets("WaterBreakDown").Visible = True
              Sheets("ElecBreakDown").Visible = True
              Sheets("ElecBreakDown").Activate
                          
              GenerateElectricityBreakDown         '  ***** PERFORMS ALL ELECTRICITY CALCULATIONS *****
              GenerateWaterBreakDown               '  ***** PERFORMS ALL WATER CALCULATIONS *****
              
              UpdateMonthlyCals   '----
                          
              Sheets("WaterBreakDown").Visible = True
              Sheets("ElecBreakDown").Visible = True
              Sheets("ElecBreakDown").Activate
                          
              Application.ScreenUpdating = True
              Cells.SpecialCells(xlCellTypeVisible)(1).Select
              Exit Sub
          End If
      
      Case 3                                       ' Tariffs
      
         ' Sheets("Tariffs").Visible = True
         ' Sheets("Tariffs").Select
          GotoTariff (CellText)
      
      Case Else
          MsgBox ("Select a MONTH on the top row")
    
    End Select
    RemCol = ActiveCell.Column
End Sub

Sub DisplayBuilding()

    Application.ScreenUpdating = False
    Building_Name_Col = Range("Building_List_Top").Column
    Building_Name_Row = Range("Building_List_Top").Row
      
        If ActiveCell.Row < Building_Name_Row Then
            Application.ScreenUpdating = True
            MsgBox ("Please select a Building from the list")
            Application.ScreenUpdating = True
            Exit Sub
        End If

        SheetName = Cells(ActiveCell.Row, Building_Name_Col)
        
        If SheetName = "" Then Exit Sub
        
        ' -------------------------------------------------------------------
        HideAllSheets
        LastBuilding = SheetName

    ' -------------------------------------------------------------------
    On Error GoTo BuildingNameNotFound
    
        Sheets(SheetName).Visible = True
        Sheets(SheetName).Select
    On Error GoTo 0
        
        Sheets(SheetName).Rows("4:11").EntireRow.Hidden = ShowOptionStatus
        Application.ScreenUpdating = True
        
        ' Get position of "Electricity" start
        ElecIndex = FindRow(1, "Electricity")
        Sheets(SheetName).Cells(ElecIndex, 1).Select
    
        Sheets(SheetName).Range("D11").Select           ' Sets the Sheet to home position
        
       ' -------------------------------------------------------------------
        
        ' Goto Last Month Entered ------------------------------
        Dim EmptyCell As Boolean: EmptryCell = False
        ColIndex = 5
        While EmptyCell = False
            CellContent = Sheets(SheetName).Cells(ElecIndex + 1, ColIndex)
            If CellContent = "" Then
                Sheets(SheetName).Cells(1, ColIndex - 1).Select ' Selects the most recent Month
                EmptyCell = True
            End If
            ColIndex = ColIndex + 1
        Wend
        ' -------------------------------------------------------------------
        
    Application.ScreenUpdating = True
Exit Sub

BuildingNameNotFound:
MsgBox ("Building Name: " & SheetName & " does not exists")







End Sub



Sub Home()
Attribute Home.VB_ProcData.VB_Invoke_Func = "H\n14"
    ' Home Macro
    ' Keyboard Shortcut: Ctrl+Shift+H
    
    HideAllSheets
End Sub

Sub HideAllSheets()
Attribute HideAllSheets.VB_ProcData.VB_Invoke_Func = " \n14"
On Error Resume Next
    Application.ScreenUpdating = False
    Dim xWs As Worksheet
    For Each xWs In Application.ActiveWorkbook.Worksheets
        If xWs.Name <> "Home" Then
            xWs.Visible = xlSheetHidden
        End If
    Next
   ' Application.ScreenUpdating = True
    
    Sheets("Home").Visible = True
    Sheets("Home").Select
    Sheets("Home").Range("A1") = "Utility Dash  -  © Copyright J D Greaves"
End Sub

Sub ShowAllSheets()
Attribute ShowAllSheets.VB_ProcData.VB_Invoke_Func = "S\n14"
' ShowAllSheets Macro
' Keyboard Shortcut: Ctrl+Shift+S

    Application.ScreenUpdating = False
    Dim wks As Worksheet
    For Each wks In ActiveWorkbook.Worksheets
        wks.Visible = xlSheetVisible
    Next wks
    Application.ScreenUpdating = True
    Application.DisplayFormulaBar = True
    
End Sub

Sub GotoElectricity()
Attribute GotoElectricity.VB_ProcData.VB_Invoke_Func = "E\n14"
' GotoElectricity Macro
' Keyboard Shortcut: Ctrl+Shift+E
    Sheets("ElecBreakDown").Visible = True
    Sheets("ElecBreakDown").Select
    
    Range("A1").Select
    Application.GoTo ActiveCell, Scroll:=True
End Sub

Sub GotoBackElec()
    Range("A1").Select
    Application.GoTo ActiveCell, Scroll:=True
End Sub

Sub GotoWater()
Attribute GotoWater.VB_ProcData.VB_Invoke_Func = "W\n14"
' GotoWater Macro
' Keyboard Shortcut: Ctrl+Shift+W
    Sheets("WaterBreakdown").Visible = True
    Sheets("WaterBreakdown").Select
    Range("A1").Select
    Application.GoTo ActiveCell, Scroll:=True
    
End Sub

Sub Goto_San()
    Application.GoTo Sheets("ElecBreakDown").Range("U1"), Scroll:=True
End Sub

Sub Return2Sheet()
Attribute Return2Sheet.VB_ProcData.VB_Invoke_Func = "H\n14"
' Returns back to sheet from Invoice
 On Error GoTo Skipit:
    Sheets(LastBuilding).Select
Skipit:
End Sub

Sub BrowseDataFolder()
    FolderPath = Application.ActiveWorkbook.Path & "\Building_Data"
    ThisWorkbook.FollowHyperlink (FolderPath)
End Sub

Sub SaveAsPDF()
' SaveAsPDF Macro
'        ThisFilename = BuildingName & " " & iEUnit & " " & UCase(Format(SelDate, "MMM-YY")) & ".pdf"
        ThisFileName = Format(SelDate, "YYYY-MM") & " " & BuildingName & " " & UnitNo & ".pdf"
        fileSaveName = Application.GetSaveAsFilename(InitialFileName:=ThisFileName, fileFilter:="PDF (*.pdf), *.pdf")
        If fileSaveName <> False Then
            ActiveSheet.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fileSaveName
        End If
        
End Sub

Sub SaveAsPDF_BuildingReport()
' SaveAsPDF Macro
'        ThisFilename = BuildingName & " " & iEUnit & " " & UCase(Format(SelDate, "MMM-YY")) & ".pdf"
        ThisFileName = BuildingName & " Building Report " & Format(SelDate, "YYYY-MM") & ".pdf"
        fileSaveName = Application.GetSaveAsFilename(InitialFileName:=ThisFileName, fileFilter:="PDF (*.pdf), *.pdf")
        If fileSaveName <> False Then
            ActiveSheet.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fileSaveName
        End If
        
End Sub

Sub GrabBCMInfo()
' GrabBCMInfo Macro
    Sheets("BCM Output").Select
    Range("B3").Select
    Range(Selection, Selection.End(xlDown)).Select
    Selection.Copy
    Range("B2").Select
End Sub

Sub GrabBCMExclVat()
' GrabBCMInfo Macro
    Sheets("BCM Output").Select
    Range("C3").Select
    Range(Selection, Selection.End(xlDown)).Select
    Selection.Copy
    Range("C2").Select
End Sub

Sub GrabBCMInclVat()
' GrabBCMInfo Macro
    Sheets("BCM Output").Select
    Range("D3").Select
    Range(Selection, Selection.End(xlDown)).Select
    Selection.Copy
    Range("D2").Select
End Sub

Sub GrabWCUInfo()
 
    Range("A2").Select
    Range(Selection, Selection.End(xlToRight)).Select
    Range(Selection, Selection.End(xlDown)).Select
    Selection.Copy
    ActiveWindow.LargeScroll Down:=-2
End Sub

Sub GotoTariffTables()
Attribute GotoTariffTables.VB_ProcData.VB_Invoke_Func = "T\n14"
' GotoTariffTables Macro
' Keyboard Shortcut: Ctrl+Shift+T
    Sheets("Tariffs").Visible = True
    Sheets("Tariffs").Select
End Sub

Sub GotoBCMOutput()
Attribute GotoBCMOutput.VB_ProcData.VB_Invoke_Func = " \n14"
' GotoBCMOutput Macro
' Keyboard Shortcut: Ctrl+Shift+B
    Sheets("BCM Output").Visible = True
    Sheets("BCM Output").Select
    Range("B1").Select
End Sub

Sub HideShowOptions()
Attribute HideShowOptions.VB_ProcData.VB_Invoke_Func = "O\n14"
' HideShowOptions Macro
' Keyboard Shortcut: Ctrl+Shift+O
    Application.ScreenUpdating = False
    ElecIndex = FindRow(1, "Electricity")
     
    SelectedRows = "4:" & ElecIndex - 2
    If Rows(SelectedRows).EntireRow.Hidden = True Then
        Rows(SelectedRows).EntireRow.Hidden = False
    Else
        Rows(SelectedRows).EntireRow.Hidden = True
    End If
       
 ' ShowOptionStatus = Rows("4:11").EntireRow.Hidden
 
 Application.ScreenUpdating = True
End Sub


Sub ShowHelp()
    Sheets("Help").Visible = True
    Sheets("Help").Select
End Sub

Sub GotoSettings()
Attribute GotoSettings.VB_ProcData.VB_Invoke_Func = " \n14"
' GotoSettings Macro
    Sheets("Settings").Visible = True
    Sheets("Settings").Select
End Sub

Sub PrintInvoiceSetup()
' PrintInvoice Macro
    Range("A1:G54").Select
    Application.Dialogs(xlDialogPrinterSetup).Show
    'ActiveWindow.SelectedSheets.PrintOut
    Range("H1").Select
End Sub

Sub PrintInvoice()
' PrintInvoice Macro
    Range("A1:G54").Select
    ActiveWindow.SelectedSheets.PrintOut
    Range("H1").Select
End Sub

Sub NextSheet()
Attribute NextSheet.VB_ProcData.VB_Invoke_Func = "N\n14"
' NextSheet Macro
' Keyboard Shortcut: Ctrl+Shift+N
'
    Sheets("Home").Select
    ActiveCell.Offset(1).Select
    DisplayBuilding
    
End Sub
 
Sub PrevSheet()
Attribute PrevSheet.VB_ProcData.VB_Invoke_Func = "M\n14"
' PrevSheet Macro
' Keyboard Shortcut: Ctrl+Shift+M
'
    Sheets("Home").Select
    ActiveCell.Offset(-1).Select
    DisplayBuilding
    
End Sub

Sub GotoWeConnectU()
    Sheets("WCU Output").Visible = True
    Sheets("WCU Output").Select

End Sub

Sub GotoCheckList()
    Sheets("CheckList").Visible = True
    Sheets("CheckList").Select
End Sub

Sub OpenTariffPdf()
     ' Mainlineup Macro
  
    Filename = Sheets("Tariffs").Cells(ActiveSheet.Shapes(Application.Caller).TopLeftCell.Row, 13)
    ' OutputPath = Sheets("Settings").Range("C5")
    OutputPath = Application.ActiveWorkbook.Path
   
 On Error GoTo GetOut
    ThisWorkbook.FollowHyperlink (OutputPath & "\Tariffs\" & Filename)
    Exit Sub
    
GetOut:
    MsgBox ("File not found: " & OutputPath & "\Tariffs\" & Filename)
End Sub

Sub GotoFlatRateTariff()
  ActiveWindow.ScrollRow = 65
End Sub

Sub GotoTariffTop()
    ActiveWindow.ScrollRow = 1
End Sub

Sub TariffLinesShow()
    Rows("66:228").Select
    Selection.EntireRow.Hidden = False
    Range("B65").Select
End Sub

Sub TariffLinesHide()
    Range("67:74,76:83,85:92,94:101,103:110,112:119,121:128,130:137,139:146,148:155,157:164,166:173,175:182,184:191,193:200,202:209,211:218,220:227").Select
    Selection.EntireRow.Hidden = True
    Range("B65").Select
End Sub

Sub OneDriveLink()
    Dim OneDriveLink As String
    OneDriveLink = "https://onedrive.live.com/?authkey=%21Ah58SfUNORSOaSQ&id=5234BF7E17C5F615%21111768&cid=5234BF7E17C5F615"
    ThisWorkbook.FollowHyperlink OneDriveLink
End Sub

Sub MonthlyStats()
    Rows("4:11").EntireRow.Hidden = True ' Hide options
    If ActiveWindow.ScrollRow = 500 Then
        ActiveWindow.ScrollRow = 13
    Else
        ActiveWindow.ScrollRow = 500
    End If
End Sub

Sub GotoVariable_List()
Attribute GotoVariable_List.VB_ProcData.VB_Invoke_Func = " \n14"
     Sheets("Variable_List").Visible = True
     Sheets("Variable_List").Select
End Sub

Sub GotoReadableReportTemplate()
    Sheets("ReadableReportTemplate").Visible = True
    Sheets("ReadableReportTemplate").Select
End Sub

Sub GotoBuildingReportTemplate()
    Sheets("BuildingReportTemplate").Visible = True
    Sheets("BuildingReportTemplate").Select
End Sub

Sub NextReport()
    Sheets("ReadableReportTemplate").Visible = True
    Sheets("ReadableReportTemplate").Select
    GenerateReport
End Sub
Sub PrevReport()
    Sheets("BuildingReportTemplate").Visible = True
    Sheets("BuildingReportTemplate").Select
    GenerateReport
End Sub
 
