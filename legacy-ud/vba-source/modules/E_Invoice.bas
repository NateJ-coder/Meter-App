Attribute VB_Name = "E_Invoice"
Dim ThisColor As Integer
Dim UnitNos As String

' INVOICES %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
Sub GotoInvoice()
' Keyboard Shortcut: Ctrl+Shift+I
    Sheets("Invoice").Visible = True
    Sheets("Invoice").Select
    Range("E2:F2").Select
End Sub

Sub CreateInvoice(Row As Integer)
 
    Dim InvoiceLine As String
    Dim ThisAmount As Double
   
 '  START OF INVOICE *********************************************************************************************
 '  Personalises the Invoice -------------------------------------------------------------------------------------
 
    Sheets("INVOICE").Visible = True
    Sheets("INVOICE").Activate
    
    UnitNo = Row - 8
    InvoiceClear

    Range("F4") = Now
    Range("D7") = UnitNo & " " & BuildingName & " " & Format(SelDate, "YYYY-MM")
    
    Range("B10") = "Unit Owner"
    Range("B11") = UnitNo & " " & BuildingName & " (" & UnitNames(UnitNo) & ")"
    Range("D4") = PrevDate & " - " & SelDate
    
    InvoiceLine = ""
    NextLine = 20  '  --------------- Starting line for entries on the Invoice
     
    ' -------------------------------------------------------- PQ for this Unit
      Cells(NextLine - 2, 2) = "The PQ (Percentage Quota) for this Unit is: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"
      
   '  ELECTRICITY --------------------------------------------------------
    If NewCalc = True Then  ' ##########################
        ThisAmount = GetElecCostsNew(ElecUnitCons(UnitNo), 1)
    Else
        ThisAmount = GetElecCosts(ElecUnitCons(UnitNo), 1)
    End If
'    ThisAmount = GetElecCosts(ElecUnitCons(UnitNo), 1) ' PERFORMS THE CALCULATION SPLIT - MUST GO FIRST
    
    Call AddLine("Unit's Electricity Consumption (" & ElecPrevReadings(UnitNo) & " - " & ElecThisReadings(UnitNo) & ") Total: " & ElecUnitCons(UnitNo) & "Kw *", ThisAmount)
    Indent = "   * "
    ' -------------------------------------------------------- Electricity Breakdown Tiered Tariff
  
    If ElecTariffUnits1 <> 0 Then
        InvoiceLine = Indent & ElecTariffUnits1 & "Kw @ R" & Format(ET1 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost1, "0.00")
        Call AddLine(InvoiceLine, 0)
    End If
      If ElecTariffUnits2 <> 0 Then
        InvoiceLine = Indent & ElecTariffUnits2 & "Kw @ R" & Format(ET2 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost2, "0.00")
        Call AddLine(InvoiceLine, 0)
    End If
      If ElecTariffUnits3 <> 0 Then
        InvoiceLine = Indent & ElecTariffUnits3 & "Kw @ R" & Format(ET3 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost3, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
      If ElecTariffUnits4 <> 0 Then
        InvoiceLine = Indent & ElecTariffUnits4 & "Kw @ R" & Format(ET4 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost4, "0.00")
        Call AddLine(InvoiceLine, 0)
    End If
      If ElecTariffUnits5 <> 0 Then
        InvoiceLine = Indent & ElecTariffUnits6 & "Kw @ R" & Format(ET5 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost5, "0.00")
       Call AddLine(InvoiceLine, 0)
    End If
 
 ' ---------------------------------------------------------------------------------
   ThisAmount = ElecBulkDiff(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice1)
            Case "EVEN": InvoiceLine = OptionText1 & ": " & Format(ElecDifference + OptionAmount1, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText1 & ": " & Format(ElecDifference + OptionAmount1, "R#.00") & " x PQ"
            Case "FIXED": InvoiceLine = OptionText1 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
     
        Call AddLine(InvoiceLine, ThisAmount)
      
    End If
   
' ---------------------------------------------------------------------------------
'     OptionCharge2()
   ThisAmount = OptionCharge2(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice2)
            Case "EVEN": InvoiceLine = OptionText2 & ": " & Format(OptionAmount2, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText2 & ": " & Format(OptionAmount2, "R#.00") & " x PQ"
            Case "FIXED": InvoiceLine = OptionText2 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
        Call AddLine(InvoiceLine, ThisAmount)
    End If
   
' ---------------------------------------------------------------------------------
'     OptionCharge3()
   ThisAmount = OptionCharge3(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice3)
            Case "EVEN": InvoiceLine = OptionText3 & ": " & Format(OptionAmount3, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText3 & ": " & Format(OptionAmount3, "R#.00") & " x PQ"
            Case "FIXED": InvoiceLine = OptionText3 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
         Call AddLine(InvoiceLine, ThisAmount)
    End If
   ' ---------------------------------------------------------------------------------
    '   WATER  ##################################################################################################
     If NewCalc = True Then  ' ##########################
        ThisAmount = GetWaterCostsNew(WaterUnitCons(UnitNo), 1)
    Else
        ThisAmount = GetWaterCosts(WaterUnitCons(UnitNo), 1)
    End If
    
   '    ThisAmount = GetWaterCosts(WaterUnitCons(UnitNo), 1) ' PERFORMS THE CALCULATION SPLIT - MUST GO FIRST
    Call AddLine("Unit's Water Consumption " & WaterPrevReadings(UnitNo) & " - " & WaterThisReadings(UnitNo) & "  Total: " _
                                                     & WaterUnitCons(UnitNo) & "Kl **)", ThisAmount)
    Indent = "   ** "
    If WaterTariffUnits1 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits1 & "Kl @ R" & Format(WT1, "#.00") & " per Kl = R" & Format(WaterTariffCost1, "0.00")
        Call AddLine(InvoiceLine, 0)
    End If
      If WaterTariffUnits2 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits2 & "Kl @ R" & Format(WT2, "#.00") & " per Kl = R" & Format(WaterTariffCost2, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
      If WaterTariffUnits3 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits3 & "Kl @ R" & Format(WT3, "#.00") & " per Kl = R" & Format(WaterTariffCost3, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
      If WaterTariffUnits4 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits4 & "Kl @ R" & Format(WT4, "#.00") & " per Kl = R" & Format(WaterTariffCost4, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
      If WaterTariffUnits5 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits5 & "Kl @ R" & Format(WT5, "#.00") & " per Kl = R" & Format(WaterTariffCost5, "0.00")
        Call AddLine(InvoiceLine, 0)
    End If
    If WaterTariffUnits6 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits6 & "Kl @ R" & Format(WT5, "#.00") & " per Kl = R" & Format(WaterTariffCost6, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
    If WaterTariffUnits7 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits7 & "Kl @ R" & Format(WT7, "#.00") & " per Kl = R" & Format(WaterTariffCost7, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
    
    '##################################################################################################
    
    ' ---------------------------------------------------------------------------------
'     WaterBulkDiff()
   ThisAmount = WaterBulkDiff(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice4)
            Case "EVEN": InvoiceLine = OptionText4 & ": " & Format(WaterDifference + OptionAmount4, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText4 & ": " & Format(WaterDifference + OptionAmount4, "R#.00") & " x PQ"
            Case "FIXED": InvoiceLine = OptionText1 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
     Call AddLine(InvoiceLine, ThisAmount)
      
    End If
   
' ---------------------------------------------------------------------------------
'     OptionCharge5()
   ThisAmount = OptionCharge5(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice5)
            Case "EVEN": InvoiceLine = OptionText5 & ": " & Format(OptionAmount5, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText5 & ": " & Format(OptionAmount5, "R#.00") & " x PQ"
            Case "FIXED": InvoiceLine = OptionText5 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
        Call AddLine(InvoiceLine, ThisAmount)
    End If
   
' ---------------------------------------------------------------------------------
'     OptionCharge6()
   ThisAmount = OptionCharge6(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice6)
            Case "EVEN": InvoiceLine = OptionText6 & ": " & Format(OptionAmount6, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText6 & ": " & Format(OptionAmount6, "R#.00") & " x PQ"
            Case "FIXED": InvoiceLine = OptionText6 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
        Call AddLine(InvoiceLine, ThisAmount)
    End If
   
' ---------------------------------------------------------------------------------
'     OptionCharge7()
   ThisAmount = OptionCharge7(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice7)
            Case "EVEN": InvoiceLine = OptionText7 & ": " & Format(OptionAmount7, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText7 & ": " & Format(OptionAmount7, "R#.00") & " x PQ"
            Case "FIXED": InvoiceLine = OptionText7 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
            Case "SANWATER": InvoiceLine = OptionText7 & ": " & Format(OptionCharge7(UnitNo), "R#.00") & " (By Water Usage)"
           
        End Select
        Call AddLine(InvoiceLine, ThisAmount)
    End If
   ' ---------------------------------------------------------------------------------

'     OptionCharge8()
   ThisAmount = OptionCharge8(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice8)
            Case "EVEN": InvoiceLine = OptionText8 & ": " & Format(OptionAmount8, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText8 & ": " & Format(OptionAmount8, "R#.00") & " x PQ"
            Case "FIXED": InvoiceLine = OptionText8 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
        Call AddLine(InvoiceLine, ThisAmount)
        
    
    End If
   
' ---------------------------------------------------------------------------------

    Application.GoTo Sheets("Invoice").Cells(1, 1), True
    
End Sub
Sub AddLine(InvoiceLine As String, ThisAmount As Double)
    
    If NextLine > 44 Then
        Cells(NextLine, 2) = "TOO MANY LINES TO PROCESS THIS INVOICE CORRECTLY":
        Cells(NextLine, 6) = "999999"
        Exit Sub
    End If
    If InStr(1, UCase(InvoiceLine), "ELEC") > 0 Then ThisColor = 36   ' Light Yellow
    If InStr(1, UCase(InvoiceLine), "WATER") > 0 Then ThisColor = 37  ' Light blue
    If InStr(1, UCase(InvoiceLine), "SANI") > 0 Or InStr(1, UCase(InvoiceLine), "SEWER") > 0 Then ThisColor = 35 ' Light Yellow
     If InStr(1, UCase(InvoiceLine), "REFUSE") > 0 Then ThisColor = 40   ' Light Yellow
    
    Range(Cells(NextLine, 2), Cells(NextLine, 6)).Interior.ColorIndex = ThisColor
    Cells(NextLine, 2) = InvoiceLine
   ' If ThisAmount <> 0 Then Cells(NextLine, 6) = Format(ThisAmount, "#.00")
    If ThisAmount <> 0 Then Cells(NextLine, 6) = ThisAmount
    
    NextLine = NextLine + 1
    
End Sub

  
Sub InvoiceClear()
    Range("B20:F45").Interior.ColorIndex = 2
    Range("B20:F45").ClearContents
    Range("F4,D7:F7,B10:B17").ClearContents
End Sub








Sub ProcessSelectedCells()

 '  START OF INVOICE *********************************************************************************************
    Dim selectedRange As Range
    Set selectedRange = Application.Selection

    Sheets("INVOICE").Visible = True
    Sheets("INVOICE").Activate
    InvoiceClear
    Range("F4") = Now

    Dim EachCell As Range

    NextLine = 20  '  --------------- Starting line for entries on the Invoice
    UnitNos = ""


    Ans = ""
    For Each EachCell In selectedRange.Cells
        If EachCell.Row < 9 Then MsgBox ("Cannot process one of more of the selected cells"): Exit Sub
        AddToInvoice (EachCell.Row)
    Next
    Range("D4") = PrevDate & " - " & SelDate
    Range("D7") = UnitNos & " " & BuildingName & " " & Format(SelDate, "YYYY-MM")

    Range("B10") = "Unit Owner"
    Range("B11") = UnitNos & " " & BuildingName & " (" & UnitNames(UnitNo) & ")"

    'Cells(NextLine - 2, 2) = "The PQ (Percentage Quota) for this Unit is: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"

    Application.GoTo Sheets("Invoice").Cells(1, 1), True

End Sub
'
Sub AddToInvoice(Row As Integer)

    Dim InvoiceLine As String
    Dim ThisAmount As Double

    UnitNo = Row - 8
    InvoiceLine = ""

    If UnitNos = "" Then UnitNos = UnitNo Else UnitNos = UnitNos & ", " & UnitNo

    ' ************************************************************************************


   '  ELECTRICITY --------------------------------------------------------
    If PrepaidElecInstalled(UnitNo) > 0 Then
        ThisAmount = 0
        InvoiceLine = ("Prepaid Meter Installed")
        Call AddLine(InvoiceLine, 0)
    Else



        If NewCalc = True Then  ' ##########################
            ThisAmount = GetElecCostsNew(ElecUnitCons(UnitNo), 1)
        Else
            ThisAmount = GetElecCosts(ElecUnitCons(UnitNo), 1)
        End If

    '      ThisAmount = GetElecCosts(ElecUnitCons(UnitNo), 1) ' PERFORMS THE CALCULATION SPLIT - MUST GO FIRST

          Call AddLine("Unit:" & UnitNo & " Electricity Consumption (" & ElecPrevReadings(UnitNo) & " - " & ElecThisReadings(UnitNo) & ") Total: " & ElecUnitCons(UnitNo) & "Kw *", ThisAmount)
          Indent = "   * "
          ' -------------------------------------------------------- Electricity Breakdown Tiered Tariff

          If ElecTariffUnits1 <> 0 Then
              InvoiceLine = Indent & ElecTariffUnits1 & "Kw @ R" & Format(ET1 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost1, "0.00")
              Call AddLine(InvoiceLine, 0)
          End If
            If ElecTariffUnits2 <> 0 Then
              InvoiceLine = Indent & ElecTariffUnits2 & "Kw @ R" & Format(ET2 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost2, "0.00")
              Call AddLine(InvoiceLine, 0)
          End If
            If ElecTariffUnits3 <> 0 Then
              InvoiceLine = Indent & ElecTariffUnits3 & "Kw @ R" & Format(ET3 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost3, "0.00")
               Call AddLine(InvoiceLine, 0)
          End If
            If ElecTariffUnits4 <> 0 Then
              InvoiceLine = Indent & ElecTariffUnits4 & "Kw @ R" & Format(ET4 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost4, "0.00")
              Call AddLine(InvoiceLine, 0)
          End If
            If ElecTariffUnits5 <> 0 Then
              InvoiceLine = Indent & ElecTariffUnits6 & "Kw @ R" & Format(ET5 / 100, "#.00") & " per Kw = R" & Format(ElecTariffCost5, "0.00")
             Call AddLine(InvoiceLine, 0)
          End If

     End If

 ' ---------------------------------------------------------------------------------
   ThisAmount = ElecBulkDiff(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice1)
            Case "EVEN": InvoiceLine = OptionText1 & ": " & Format(ElecDifference + OptionAmount1, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText1 & ": " & Format(ElecDifference + OptionAmount1, "R#.00") & " x PQ: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"
            Case "FIXED": InvoiceLine = OptionText1 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select

          Call AddLine(InvoiceLine, ThisAmount)

    End If

' ---------------------------------------------------------------------------------
'     OptionCharge2()
   ThisAmount = OptionCharge2(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice2)
            Case "EVEN": InvoiceLine = OptionText2 & ": " & Format(OptionAmount2, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText2 & ": " & Format(OptionAmount2, "R#.00") & " x PQ: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"
            Case "FIXED": InvoiceLine = OptionText2 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
        Call AddLine(InvoiceLine, ThisAmount)
    End If

' ---------------------------------------------------------------------------------
'     OptionCharge3()
   ThisAmount = OptionCharge3(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice3)
            Case "EVEN": InvoiceLine = OptionText3 & ": " & Format(OptionAmount3, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText3 & ": " & Format(OptionAmount3, "R#.00") & " x PQ: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"
            Case "FIXED": InvoiceLine = OptionText3 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
         Call AddLine(InvoiceLine, ThisAmount)
    End If
   ' ---------------------------------------------------------------------------------
    '   WATER  ##################################################################################################
    If NewCalc = True Then  ' ##########################
        ThisAmount = GetWaterCostsNew(WaterUnitCons(UnitNo), 1)
    Else
        ThisAmount = GetWaterCosts(WaterUnitCons(UnitNo), 1)
    End If
   ' ThisAmount = GetWaterCosts(WaterUnitCons(UnitNo), 1) ' PERFORMS THE CALCULATION SPLIT - MUST GO FIRST



    Call AddLine("Unit:" & UnitNo & " Water Consumption " & WaterPrevReadings(UnitNo) & " - " & WaterThisReadings(UnitNo) & "  Total: " _
                                                     & WaterUnitCons(UnitNo) & "Kl **)", ThisAmount)
    Indent = "   ** "
    If WaterTariffUnits1 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits1 & "Kl @ R" & Format(WT1, "#.00") & " per Kl = R" & Format(WaterTariffCost1, "0.00")
        Call AddLine(InvoiceLine, 0)
    End If
      If WaterTariffUnits2 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits2 & "Kl @ R" & Format(WT2, "#.00") & " per Kl = R" & Format(WaterTariffCost2, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
      If WaterTariffUnits3 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits3 & "Kl @ R" & Format(WT3, "#.00") & " per Kl = R" & Format(WaterTariffCost3, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
      If WaterTariffUnits4 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits4 & "Kl @ R" & Format(WT4, "#.00") & " per Kl = R" & Format(WaterTariffCost4, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
      If WaterTariffUnits5 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits5 & "Kl @ R" & Format(WT5, "#.00") & " per Kl = R" & Format(WaterTariffCost5, "0.00")
        Call AddLine(InvoiceLine, 0)
    End If
    If WaterTariffUnits6 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits6 & "Kl @ R" & Format(WT5, "#.00") & " per Kl = R" & Format(WaterTariffCost6, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If
    If WaterTariffUnits7 <> 0 Then
        InvoiceLine = Indent & WaterTariffUnits7 & "Kl @ R" & Format(WT7, "#.00") & " per Kl = R" & Format(WaterTariffCost7, "0.00")
         Call AddLine(InvoiceLine, 0)
    End If

    '##################################################################################################

    ' ---------------------------------------------------------------------------------
'     WaterBulkDiff()
   ThisAmount = WaterBulkDiff(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice4)
            Case "EVEN": InvoiceLine = OptionText4 & ": " & Format(WaterDifference + OptionAmount4, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText4 & ": " & Format(WaterDifference + OptionAmount4, "R#.00") & " x PQ: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"
            Case "FIXED": InvoiceLine = OptionText1 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
     Call AddLine(InvoiceLine, ThisAmount)

    End If

' ---------------------------------------------------------------------------------
'     OptionCharge5()
   ThisAmount = OptionCharge5(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice5)
            Case "EVEN": InvoiceLine = OptionText5 & ": " & Format(OptionAmount5, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText5 & ": " & Format(OptionAmount5, "R#.00") & " x PQ: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"
            Case "FIXED": InvoiceLine = OptionText5 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
        Call AddLine(InvoiceLine, ThisAmount)
    End If

' ---------------------------------------------------------------------------------
'     OptionCharge6()
   ThisAmount = OptionCharge6(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice6)
            Case "EVEN": InvoiceLine = OptionText6 & ": " & Format(OptionAmount6, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText6 & ": " & Format(OptionAmount6, "R#.00") & " x PQ: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"
            Case "FIXED": InvoiceLine = OptionText6 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
        Call AddLine(InvoiceLine, ThisAmount)
    End If

' ---------------------------------------------------------------------------------
'     OptionCharge7()
   ThisAmount = OptionCharge7(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice7)
            Case "EVEN": InvoiceLine = OptionText7 & ": " & Format(OptionAmount7, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText7 & ": " & Format(OptionAmount7, "R#.00") & " x PQ: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"
            Case "FIXED": InvoiceLine = OptionText7 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
            Case "SANWATER": InvoiceLine = OptionText7 & ": " & Format(OptionCharge7(UnitNo), "R#.00") & " (By Water Usage)"
           ' Case "SANWATER": OptionCharge7(i) = OptionAmount7 + GetSanCostsNew(WaterUnitCons(i), 1)
         
        End Select
        Call AddLine(InvoiceLine, ThisAmount)
    End If
   ' ---------------------------------------------------------------------------------

'     OptionCharge8()
   ThisAmount = OptionCharge8(UnitNo)
   If ThisAmount <> 0 Then

        InvoiceLine = ""
        Select Case UCase(OptionChoice8)
            Case "EVEN": InvoiceLine = OptionText8 & ": " & Format(OptionAmount8, "R#.00") & " / " & ChargeableUnitCount & " (Evenly Shared)"
            Case "PQ":   InvoiceLine = OptionText8 & ": " & Format(OptionAmount8, "R#.00") & " x PQ: " & Format(PercentageQuotes(UnitNo), "0.000") & "%"
            Case "FIXED": InvoiceLine = OptionText8 & ": (Set Amount)"
            Case "NONE": InvoiceLine = ""
        End Select
        Call AddLine(InvoiceLine, ThisAmount)


    End If

' ---------------------------------------------------------------------------------



End Sub















