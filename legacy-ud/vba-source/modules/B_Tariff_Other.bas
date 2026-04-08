Attribute VB_Name = "B_Tariff_Other"
' LOAD TARIFFS AND OTHER FUNCTIONS %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

' Tarrifs
    Public ERange1 As String
    Public ERange2 As String
    Public ERange3 As String
    Public ERange4 As String
    Public ERange5 As String
    Public ERange6 As String
    Public ERange7 As String
    Public ERange8 As String

    Public WRange1 As String
    Public WRange2 As String
    Public WRange3 As String
    Public WRange4 As String
    Public WRange5 As String
    Public WRange6 As String
    Public WRange7 As String
    Public WRange8 As String

    Public EQ1, EQ2, EQ3, EQ4, EQ5, EQ6, EQ7, EQ8    As Double
    Public ET1, ET2, ET3, ET4, ET5, ET6, ET7, ET8     As Double

    Public WQ1, WQ2, WQ3, WQ4, WQ5, WQ6, WQ7, WQ8 As Double
    Public WT1, WT2, WT3, WT4, WT5, WT6, WT7, WT8 As Double

    Public SQ1, SQ2, SQ3, SQ4, SQ5, SQ6, SQ7, SQ8 As Double
    Public ST1, ST2, ST3, ST4, ST5, ST6, ST7, ST8 As Double

    Public OtherChargesDesc(8) As String
    Public OtherChargesTariff(8) As Double

    Public OffsetCol As Integer

    Public NewCalc As Boolean

Public Function GotoTariff(TariffName As String) As Boolean


  If TariffName = "" Then
        MsgBox ("No Tariff Table assigned to this Month"):
        GotoTariff = False
        Exit Function
    End If

    Dim OffsetCol As Integer
    Dim OffsetRow As Integer

  ' Search for "TariffName" to start

    Index = 1
    ThisCell = Sheets("Tariffs").Cells(Index, 2)
    While ThisCell <> TariffName
        Index = Index + 1
        ThisCell = Sheets("Tariffs").Cells(Index, 2)
        If Index = 1000 Then
            MsgBox ("No Tarrif Title: " & TariffName)
            GotoTariff = False
            Exit Function
        End If
    Wend

    OffsetRow = Index
    
    Sheets("Tariffs").Visible = True
    Sheets("Tariffs").Select
      
    Cells(OffsetRow, 2).Select
    
    ActiveWindow.ScrollRow = OffsetRow
    'ActiveWindow.ScrollColumn = ThisCol
    
    GotoTariff = True
    

End Function

  
Public Function LoadTarrifs(TariffName As String) As Boolean

    If TariffName = "" Then
        MsgBox ("No Tariff Table assigned to this Month"):
        LoadTarrifs = False
        Exit Function
    End If

    Dim OffsetCol As Integer
    Dim OffsetRow As Integer

  ' Search for "TariffName" to start

    Index = 1
    ThisCell = Sheets("Tariffs").Cells(Index, 2)
    While ThisCell <> TariffName
        Index = Index + 1
        ThisCell = Sheets("Tariffs").Cells(Index, 2)
        If Index = 1000 Then
            MsgBox ("No Tarrif Title: " & TariffName)
            LoadTarrifs = False
            Exit Function
        End If
    Wend

    OffsetRow = Index


 ' WATER TARIFFS **************************************

    OffsetCol = 3
    On Error Resume Next

    WQ1 = 0: WQ2 = 0: WQ3 = 0: WQ4 = 0: WQ5 = 0: WQ6 = 0: WQ7 = 0: WQ8 = 0
    WT1 = 0: WT2 = 0: WT3 = 0: WT4 = 0: WT5 = 0: WT6 = 0: WT7 = 0: WT8 = 0

    ' Quantities
    WQ1 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow, OffsetCol), "-") + 1))
    WQ2 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 1, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 1, OffsetCol), "-") + 1))
    WQ3 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 2, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 2, OffsetCol), "-") + 1))
    WQ4 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 3, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 3, OffsetCol), "-") + 1))
    WQ5 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 4, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 4, OffsetCol), "-") + 1))
    WQ6 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 5, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 5, OffsetCol), "-") + 1))
    WQ7 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 6, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 6, OffsetCol), "-") + 1))
    WQ8 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 7, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 7, OffsetCol), "-") + 1))

    ' Tarrif Charges
    WT1 = Sheets("Tariffs").Cells(OffsetRow, OffsetCol + 1)
    WT2 = Sheets("Tariffs").Cells(OffsetRow + 1, OffsetCol + 1)
    WT3 = Sheets("Tariffs").Cells(OffsetRow + 2, OffsetCol + 1)
    WT4 = Sheets("Tariffs").Cells(OffsetRow + 3, OffsetCol + 1)
    WT5 = Sheets("Tariffs").Cells(OffsetRow + 4, OffsetCol + 1)
    WT6 = Sheets("Tariffs").Cells(OffsetRow + 5, OffsetCol + 1)
    WT7 = Sheets("Tariffs").Cells(OffsetRow + 6, OffsetCol + 1)
    WT8 = Sheets("Tariffs").Cells(OffsetRow + 7, OffsetCol + 1)


 ' ELECTRICITY TARIFFS **************************************

    OffsetCol = 6


    ' Quantities
    EQ1 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow, OffsetCol), "<") + 1))
    EQ2 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 1, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 1, OffsetCol), "<") + 1))
    EQ3 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 2, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 2, OffsetCol), "<") + 1))
    EQ4 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 3, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 3, OffsetCol), "<") + 1))
    EQ5 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 4, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 4, OffsetCol), "<") + 1))
    EQ6 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 5, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 5, OffsetCol), "<") + 1))
    EQ7 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 6, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 6, OffsetCol), "<") + 1))
    EQ8 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 7, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 7, OffsetCol), "<") + 1))


    ' Tarrif Charges
    ET1 = Sheets("Tariffs").Cells(OffsetRow, OffsetCol + 1)
    ET2 = Sheets("Tariffs").Cells(OffsetRow + 1, OffsetCol + 1)
    ET3 = Sheets("Tariffs").Cells(OffsetRow + 2, OffsetCol + 1)
    ET4 = Sheets("Tariffs").Cells(OffsetRow + 3, OffsetCol + 1)
    ET5 = Sheets("Tariffs").Cells(OffsetRow + 4, OffsetCol + 1)
    ET6 = Sheets("Tariffs").Cells(OffsetRow + 5, OffsetCol + 1)
    ET7 = Sheets("Tariffs").Cells(OffsetRow + 6, OffsetCol + 1)
    ET8 = Sheets("Tariffs").Cells(OffsetRow + 7, OffsetCol + 1)



 ' SANITATION TARIFFS **************************************

    OffsetCol = 9


    ' Quantities
    SQ1 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow, OffsetCol), "<") + 1))
    SQ2 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 1, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 1, OffsetCol), "<") + 1))
    SQ3 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 2, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 2, OffsetCol), "<") + 1))
    SQ4 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 3, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 3, OffsetCol), "<") + 1))
    SQ5 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 4, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 4, OffsetCol), "<") + 1))
    SQ6 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 5, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 5, OffsetCol), "<") + 1))
    SQ7 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 6, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 6, OffsetCol), "<") + 1))
    SQ8 = CDbl(Mid(Sheets("Tariffs").Cells(OffsetRow + 7, OffsetCol), InStr(Sheets("Tariffs").Cells(OffsetRow + 7, OffsetCol), "<") + 1))


    ' Tarrif Charges
    ST1 = Sheets("Tariffs").Cells(OffsetRow, OffsetCol + 1)
    ST2 = Sheets("Tariffs").Cells(OffsetRow + 1, OffsetCol + 1)
    ST3 = Sheets("Tariffs").Cells(OffsetRow + 2, OffsetCol + 1)
    ST4 = Sheets("Tariffs").Cells(OffsetRow + 3, OffsetCol + 1)
    ST5 = Sheets("Tariffs").Cells(OffsetRow + 4, OffsetCol + 1)
    ST6 = Sheets("Tariffs").Cells(OffsetRow + 5, OffsetCol + 1)
    ST7 = Sheets("Tariffs").Cells(OffsetRow + 6, OffsetCol + 1)
    ST8 = Sheets("Tariffs").Cells(OffsetRow + 7, OffsetCol + 1)

LoadTarrifs = True


'    Debug.Print "##### OLD #####"
    
'        Debug.Print "----- WATER -----"
'            Debug.Print WQ1 & " - " & WT1
'            Debug.Print WQ2 & " - " & WT2
'            Debug.Print WQ3 & " - " & WT3
'            Debug.Print WQ4 & " - " & WT4
'            Debug.Print WQ5 & " - " & WT5
'            Debug.Print WQ6 & " - " & WT6
'            Debug.Print WQ7 & " - " & WT7
'            Debug.Print WQ8 & " - " & WT8
              
'        Debug.Print "----- ELEC -----"
'            Debug.Print EQ1 & " - " & ET1
'            Debug.Print EQ2 & " - " & ET2
'            Debug.Print EQ3 & " - " & ET3
'            Debug.Print EQ4 & " - " & ET4
'            Debug.Print EQ5 & " - " & ET5
'            Debug.Print EQ6 & " - " & ET6
'            Debug.Print EQ7 & " - " & ET7
'            Debug.Print EQ8 & " - " & ET8
'
'
'        Debug.Print "----- SAN -----"
'
'            Debug.Print SQ1 & " - " & ST1
'            Debug.Print SQ2 & " - " & ST2
'            Debug.Print SQ3 & " - " & ST3
'            Debug.Print SQ4 & " - " & ST4
'            Debug.Print SQ5 & " - " & ST5
'            Debug.Print SQ6 & " - " & ST6
'            Debug.Print SQ7 & " - " & ST7
'            Debug.Print SQ8 & " - " & ST8
              

End Function


 Public Function GetElecCosts(r As Double, Units As Double) As Double

    ElecTariffUnits1 = 0
    ElecTariffCost1 = 0
    ElecTariffUnits2 = 0
    ElecTariffCost2 = 0
    ElecTariffUnits3 = 0
    ElecTariffCost3 = 0
    ElecTariffUnits4 = 0
    ElecTariffCost4 = 0
    ElecTariffUnits5 = 0
    ElecTariffCost5 = 0
    ElecTariffUnits6 = 0
    ElecTariffCost6 = 0
    ElecTariffUnits7 = 0
    ElecTariffCost7 = 0
    ElecTariffUnits8 = 0
    ElecTariffCost8 = 0

    EQ1x = EQ1 * Units
    EQ2x = EQ2 * Units
    EQ3x = EQ3 * Units
    EQ4x = EQ4 * Units
    EQ5x = EQ5 * Units
    EQ6x = EQ6 * Units
    EQ7x = EQ7 * Units
    EQ8x = EQ8 * Units

    Dim Ans As Double

    ' Calculations
    If r <= EQ1x Then
        ElecTariffUnits1 = r
        ElecTariffCost1 = (ElecTariffUnits1 * ET1) / 100
        Ans = ElecTariffCost1

    End If

    If r > EQ1x And r <= EQ2x Then
        ElecTariffUnits1 = EQ1x
        ElecTariffUnits2 = r - EQ1x

        ElecTariffCost1 = (ElecTariffUnits1 * ET1) / 100
        ElecTariffCost2 = (ElecTariffUnits2 * ET2) / 100

        Ans = ElecTariffCost1 + ElecTariffCost2
    End If

    If r > EQ2x And r <= EQ3x Then
        Ans = (EQ1x * ET1) + ((EQ2x - EQ1x) * ET2) + ((r - EQ2x) * ET3)
        ElecTariffUnits1 = EQ1x
        ElecTariffUnits2 = EQ2x - EQ1x
        ElecTariffUnits3 = r - EQ2x

        ElecTariffCost1 = (ElecTariffUnits1 * ET1) / 100
        ElecTariffCost2 = (ElecTariffUnits2 * ET2) / 100
        ElecTariffCost3 = (ElecTariffUnits3 * ET3) / 100

        Ans = ElecTariffCost1 + ElecTariffCost2 + ElecTariffCost3
    End If

    If r > EQ3x And r <= EQ4x Then
        Ans = (EQ1x * ET1) + ((EQ2x - EQ1x) * ET2) + ((EQ3x - EQ2x) * ET3) + ((r - EQ3x) * ET4)

        ElecTariffUnits1 = EQ1x
        ElecTariffUnits2 = EQ2x - EQ1x
        ElecTariffUnits3 = EQ3x - EQ2x
        ElecTariffUnits4 = r - EQ3x

        ElecTariffCost1 = (ElecTariffUnits1 * ET1) / 100
        ElecTariffCost2 = (ElecTariffUnits2 * ET2) / 100
        ElecTariffCost3 = (ElecTariffUnits3 * ET3) / 100
        ElecTariffCost4 = (ElecTariffUnits4 * ET4) / 100

        Ans = ElecTariffCost1 + ElecTariffCost2 + ElecTariffCost3 + ElecTariffCost4

    End If

    If r > EQ4x And r <= EQ5x Then

   Ans = (EQ1x * ET1) + ((EQ2x - EQ1x) * ET2) + ((EQ3x - EQ2x) * ET3) + ((EQ4x - EQ3x) * ET4) + ((r - EQ4x) * ET5)

        ElecTariffUnits1 = EQ1x
        ElecTariffUnits2 = EQ2x - EQ1x
        ElecTariffUnits3 = EQ3x - EQ2x
        ElecTariffUnits4 = EQ4x - EQ3x
        ElecTariffUnits5 = r - EQ4x

        ElecTariffCost1 = (ElecTariffUnits1 * ET1) / 100
        ElecTariffCost2 = (ElecTariffUnits2 * ET2) / 100
        ElecTariffCost3 = (ElecTariffUnits3 * ET3) / 100
        ElecTariffCost4 = (ElecTariffUnits4 * ET4) / 100
        ElecTariffCost5 = (ElecTariffUnits5 * ET5) / 100

        Ans = ElecTariffCost1 + ElecTariffCost2 + ElecTariffCost3 + ElecTariffCost4 + ElecTariffCost5

   End If

    If r > EQ5x And r <= EQ6x Then

        Ans = (EQ1x * ET1) + ((EQ2x - EQ1x) * ET2) + ((EQ3x - EQ2x) * ET3) + ((EQ4x - EQ3x) * ET4) + ((EQ5x - EQ4x) * ET5) + ((r - EQ5x) * ET6)

        ElecTariffUnits1 = EQ1x
        ElecTariffUnits2 = EQ2x - EQ1x
        ElecTariffUnits3 = EQ3x - EQ2x
        ElecTariffUnits4 = EQ4x - EQ3x
        ElecTariffUnits5 = EQ5x - EQ4x
        ElecTariffUnits6 = r - EQ5x

        ElecTariffCost1 = (ElecTariffUnits1 * ET1) / 100
        ElecTariffCost2 = (ElecTariffUnits2 * ET2) / 100
        ElecTariffCost3 = (ElecTariffUnits3 * ET3) / 100
        ElecTariffCost4 = (ElecTariffUnits4 * ET4) / 100
        ElecTariffCost5 = (ElecTariffUnits5 * ET5) / 100
        ElecTariffCost6 = (ElecTariffUnits6 * ET6) / 100

        Ans = ElecTariffCost1 + ElecTariffCost2 + ElecTariffCost3 + ElecTariffCost4 + ElecTariffCost5 + ElecTariffCost6
        
    End If

    GetElecCosts = Ans
    
'    Debug.Print ElecTariffUnits1 & " + " & ElecTariffUnits2 & " + " & ElecTariffUnits3 & " + " & ElecTariffUnits4 & " + " & ElecTariffUnits5 & " + " & ElecTariffUnits6
'    Debug.Print ElecTariffCost1 & " + " & ElecTariffCost2 & " + " & ElecTariffCost3 & " + " & ElecTariffCost4 & " + " & ElecTariffCost5 & " + " & ElecTariffCost6
'
 

End Function

Public Function GetWaterCosts(r As Double, Units As Double) As Double

  WaterTariffUnits1 = 0
  WaterTariffCost1 = 0
  WaterTariffUnits2 = 0
  WaterTariffCost2 = 0
  WaterTariffUnits3 = 0
  WaterTariffCost3 = 0
  WaterTariffUnits4 = 0
  WaterTariffCost4 = 0
  WaterTariffUnits5 = 0
  WaterTariffCost5 = 0
  WaterTariffUnits6 = 0
  WaterTariffCost6 = 0
  WaterTariffUnits7 = 0
  WaterTariffCost7 = 0
  WaterTariffUnits8 = 0
  WaterTariffCost8 = 0


   WQ1x = WQ1 * Units
   WQ2x = WQ2 * Units
   WQ3x = WQ3 * Units
   WQ4x = WQ4 * Units
   WQ5x = WQ5 * Units
   WQ6x = WQ6 * Units
   WQ7x = WQ7 * Units
   WQ8x = WQ8 * Units

    Dim Ans As Double

    ' Calculations
    If r <= WQ1x Then
        WaterTariffUnits1 = r
        WaterTariffCost1 = (WaterTariffUnits1 * WT1)
        Ans = WaterTariffCost1

    End If

    If r > WQ1x And r <= WQ2x Then
        WaterTariffUnits1 = WQ1x
        WaterTariffUnits2 = r - WQ1x

        WaterTariffCost1 = (WaterTariffUnits1 * WT1)
        WaterTariffCost2 = (WaterTariffUnits2 * WT2)

        Ans = WaterTariffCost1 + WaterTariffCost2
    End If

    If r > WQ2x And r <= WQ3x Then
        WaterTariffUnits1 = WQ1x
        WaterTariffUnits2 = WQ2x - WQ1x
        WaterTariffUnits3 = r - WQ2x

        WaterTariffCost1 = (WaterTariffUnits1 * WT1)
        WaterTariffCost2 = (WaterTariffUnits2 * WT2)
        WaterTariffCost3 = (WaterTariffUnits3 * WT3)

        Ans = WaterTariffCost1 + WaterTariffCost2 + WaterTariffCost3
    End If

    If r > WQ3x And r <= WQ4x Then

        WaterTariffUnits1 = WQ1x
        WaterTariffUnits2 = WQ2x - WQ1x
        WaterTariffUnits3 = WQ3x - WQ2x
        WaterTariffUnits4 = r - WQ3x

        WaterTariffCost1 = (WaterTariffUnits1 * WT1)
        WaterTariffCost2 = (WaterTariffUnits2 * WT2)
        WaterTariffCost3 = (WaterTariffUnits3 * WT3)
        WaterTariffCost4 = (WaterTariffUnits4 * WT4)

        Ans = WaterTariffCost1 + WaterTariffCost2 + WaterTariffCost3 + WaterTariffCost4

    End If

    If r > WQ4x And r <= WQ5x Then
        WaterTariffUnits1 = WQ1x
        WaterTariffUnits2 = WQ2x - WQ1x
        WaterTariffUnits3 = WQ3x - WQ2x
        WaterTariffUnits4 = WQ4x - WQ3x
        WaterTariffUnits5 = r - WQ4x

        WaterTariffCost1 = (WaterTariffUnits1 * WT1)
        WaterTariffCost2 = (WaterTariffUnits2 * WT2)
        WaterTariffCost3 = (WaterTariffUnits3 * WT3)
        WaterTariffCost4 = (WaterTariffUnits4 * WT4)
        WaterTariffCost5 = (WaterTariffUnits5 * WT5)

        Ans = WaterTariffCost1 + WaterTariffCost2 + WaterTariffCost3 + WaterTariffCost4 + WaterTariffCost5

   End If

    If r > WQ5x And r <= WQ6x Then
        WaterTariffUnits1 = WQ1x
        WaterTariffUnits2 = WQ2x - WQ1x
        WaterTariffUnits3 = WQ3x - WQ2x
        WaterTariffUnits4 = WQ4x - WQ3x
        WaterTariffUnits5 = WQ5x - WQ4x
        WaterTariffUnits6 = r - WQ5x

        WaterTariffCost1 = (WaterTariffUnits1 * WT1)
        WaterTariffCost2 = (WaterTariffUnits2 * WT2)
        WaterTariffCost3 = (WaterTariffUnits3 * WT3)
        WaterTariffCost4 = (WaterTariffUnits4 * WT4)
        WaterTariffCost5 = (WaterTariffUnits5 * WT5)
        WaterTariffCost6 = (WaterTariffUnits6 * WT6)

        Ans = WaterTariffCost1 + WaterTariffCost2 + WaterTariffCost3 + WaterTariffCost4 + WaterTariffCost5 + WaterTariffCost6
    End If

    ' ----------------------------------------------------------------
        If r > WQ6x And r <= WQ7x Then
        WaterTariffUnits1 = WQ1x
        WaterTariffUnits2 = WQ2x - WQ1x
        WaterTariffUnits3 = WQ3x - WQ2x
        WaterTariffUnits4 = WQ4x - WQ3x
        WaterTariffUnits5 = WQ5x - WQ4x
        WaterTariffUnits6 = WQ6x - WQ5x
        WaterTariffUnits7 = r - WQ6x

        WaterTariffCost1 = (WaterTariffUnits1 * WT1)
        WaterTariffCost2 = (WaterTariffUnits2 * WT2)
        WaterTariffCost3 = (WaterTariffUnits3 * WT3)
        WaterTariffCost4 = (WaterTariffUnits4 * WT4)
        WaterTariffCost5 = (WaterTariffUnits5 * WT5)
        WaterTariffCost6 = (WaterTariffUnits6 * WT6)
        WaterTariffCost7 = (WaterTariffUnits7 * WT7)

        Ans = WaterTariffCost1 + WaterTariffCost2 + WaterTariffCost3 + WaterTariffCost4 + WaterTariffCost5 + WaterTariffCost6 + WaterTariffCost7
    End If

        If r > WQ7x And r <= WQ8x Then
        WaterTariffUnits1 = WQ1x
        WaterTariffUnits2 = WQ2x - WQ1x
        WaterTariffUnits3 = WQ3x - WQ2x
        WaterTariffUnits4 = WQ4x - WQ3x
        WaterTariffUnits5 = WQ5x - WQ4x
        WaterTariffUnits6 = WQ6x - WQ5x
        WaterTariffUnits7 = WQ7x - WQ6x
        WaterTariffUnits8 = r - WQ7x

        WaterTariffCost1 = (WaterTariffUnits1 * WT1)
        WaterTariffCost2 = (WaterTariffUnits2 * WT2)
        WaterTariffCost3 = (WaterTariffUnits3 * WT3)
        WaterTariffCost4 = (WaterTariffUnits4 * WT4)
        WaterTariffCost5 = (WaterTariffUnits5 * WT5)
        WaterTariffCost6 = (WaterTariffUnits6 * WT6)
        WaterTariffCost7 = (WaterTariffUnits7 * WT7)
        WaterTariffCost8 = (WaterTariffUnits8 * WT8)

        Ans = WaterTariffCost1 + WaterTariffCost2 + WaterTariffCost3 + WaterTariffCost4 + WaterTariffCost5 + WaterTariffCost6 + WaterTariffCost7 + WaterTariffCost8
    End If

    GetWaterCosts = Ans

End Function

Sub OldQuick()
    NewCalc = False
    QuickCalc
End Sub

Sub NewQuick()
    NewCalc = True
    QuickCalc
End Sub

Sub QuickCalc()

ClearImmediate

    ' Get Vat Percentage   --------------------------------------------
    Dim GetVat As String
    GetVat = Sheets("Settings").Range("C4")
    VatPercent = CDbl(GetVat)

 ' Get Tarrif Charges   --------------------------------------------
    Dim TariffName As String
    TariffName = Sheets("Tariffs").Range("QCTariffRef")   ' Get the NAME of the TARIFF TABLE
    LoadTarrifsNew (TariffName)
    LoadTarrifs (TariffName)
    Dim Units As Double

  ' ---- ELECTRICITY ----
    Units = Sheets("Tariffs").Range("QCElecUnits").Value
    CostExcl = GetElecCostsNew(Units, 1)
    CostExcl = GetElecCosts(Units, 1)

  '  CostExcl = GetElecCosts(Units, 1)
    CostIncl = CostExcl * (1 + VatPercent)

    Sheets("Tariffs").Range("QCElecCostExcl").Value = CostExcl
    Sheets("Tariffs").Range("QCElecCostIncl").Value = CostIncl

  ' ---- WATER ----
    Units = Sheets("Tariffs").Range("QCWaterUnits").Value

    If NewCalc = True Then  ' ##########################
        CostExcl = GetWaterCostsNew(Units, 1)
    Else
        CostExcl = GetWaterCosts(Units, 1)
    End If
    ' CostExcl = GetWaterCosts(Units, 1)
    CostIncl = CostExcl * (1 + VatPercent)

    Sheets("Tariffs").Range("QCWaterCostExcl").Value = CostExcl
    Sheets("Tariffs").Range("QCWaterCostIncl").Value = CostIncl

End Sub



' #########################################################################################################################
' #########################################################################################################################

